import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { RABBIT_HANDLER } from "@golevelup/nestjs-rabbitmq";
import { hash } from "bcrypt";
import { AuthService } from "./auth.service";
import { AuthRPCController } from "./auth-rpc.controller";
import { AuditRPCController } from './audit-rpc.controller';
import { PrismaService } from "../prisma/prisma.service";
import { ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";

describe("Auth RPC sessions and permissions", () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  });
  const jwt = new JwtService();
  let user: any;
  let prisma: any;
  let auth: AuthService;
  let rpc: AuthRPCController;

  beforeEach(async () => {
    user = {
      id: 1,
      email: "owner@example.com",
      fullName: "Owner",
      role: "ADMIN",
      restaurantId: 7,
      tokenVersion: 0,
      hashedRefreshToken: null,
      passwordHash: await hash("password", 4),
    };
    prisma = {
      user: {
        findUnique: jest.fn(async () => user),
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        update: jest.fn(async ({ data }) => {
          for (const [key, value] of Object.entries(data)) {
            user[key] =
              typeof value === "object" && value && "increment" in value
                ? user[key] + value.increment
                : value;
          }
          return user;
        }),
        delete: jest.fn(),
      },
    };
    auth = new AuthService(jwt, config, prisma as PrismaService);
    rpc = new AuthRPCController(auth);
  });

  it("binds every auth command to the same dedicated durable queue", () => {
    const handlers = [AuthRPCController, AuditRPCController].flatMap(controller =>
      Object.getOwnPropertyNames(controller.prototype).map(key => Reflect.getMetadata(RABBIT_HANDLER, controller.prototype[key])))
      .filter(Boolean);
    expect(handlers).toHaveLength(Object.keys(ROUTING_KEYS).length);
    expect(handlers.map((handler) => handler.routingKey).sort()).toEqual(
      Object.values(ROUTING_KEYS).sort(),
    );
    expect(
      handlers.every(
        (handler) =>
          handler.queue === "auth.commands" &&
          handler.exchange === "app.commands",
      ),
    ).toBe(true);
  });

  it("logs in with role and restaurant, validates cookies, rotates refresh tokens and revokes on logout", async () => {
    const first = await auth.login({
      email: "OWNER@example.com",
      password: "password",
    });
    expect(first.user).toEqual({
      id: 1,
      fullName: "Owner",
      email: user.email,
      role: "ADMIN",
      restaurantId: 7,
    });
    expect(first.accessMaxAgeMs).toBe(900000);
    expect(await auth.verifyAccessToken(first.accessToken)).toEqual(first.user);
    const second = await auth.refreshByToken(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(
      auth.refreshByToken(first.refreshToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await auth.logout(1);
    await expect(
      auth.verifyAccessToken(first.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.refreshByToken(second.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects forged, expired and wrong-purpose tokens", async () => {
    const session = await auth.login({
      email: user.email,
      password: "password",
    });
    const expired = await jwt.signAsync(
      { sub: 1, tokenVersion: 0 },
      { secret: "test-access-secret", expiresIn: -1 },
    );
    for (const token of ["", "forged", expired, session.refreshToken]) {
      await expect(auth.verifyAccessToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    await expect(
      auth.refreshByToken(session.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("reads the current role from the database and refuses deleted or pending users", async () => {
    const session = await auth.login({
      email: user.email,
      password: "password",
    });
    user.role = "STOREKEEPER";
    expect((await auth.verifyAccessToken(session.accessToken)).role).toBe(
      "STOREKEEPER",
    );
    user.role = "WAIT_CONFIRM";
    await expect(
      auth.verifyAccessToken(session.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.login({ email: user.email, password: "password" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    user = null;
    await expect(
      auth.verifyAccessToken(session.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("validates DTOs over RPC without trusting caller-provided roles", async () => {
    const reply = await rpc.registerUser({
      dto: { email: "bad", role: "ADMIN" } as any,
    });
    expect(reply).toMatchObject({ success: false, error: { status: 400 } });
    const session = await auth.login({
      email: user.email,
      password: "password",
    });
    expect(
      await rpc.approve({
        accessToken: session.accessToken,
        id: 2,
        dto: { role: "ADMIN" } as any,
      }),
    ).toMatchObject({ success: false, error: { status: 400 } });
  });

  it("checks admin permissions in the worker and limits employee lookups to their restaurant", async () => {
    const session = await auth.login({
      email: user.email,
      password: "password",
    });
    await rpc.pending({ accessToken: session.accessToken });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId: 7, role: "WAIT_CONFIRM" },
      }),
    );
    expect(
      await rpc.delete({ accessToken: session.accessToken, id: 99 }),
    ).toMatchObject({ success: false, error: { status: 404 } });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 99, restaurantId: 7 }),
      }),
    );
    user.role = "MANAGER";
    expect(
      await rpc.pending({ accessToken: session.accessToken }),
    ).toMatchObject({ success: false, error: { status: 403 } });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("does not leak internal exception details through RPC", async () => {
    prisma.user.findUnique.mockRejectedValue(
      new Error("private database connection string"),
    );
    expect(
      await rpc.login({
        dto: { email: "owner@example.com", password: "password" },
      }),
    ).toEqual({
      success: false,
      error: { status: 500, message: "Внутренняя ошибка auth-сервиса" },
    });
  });
});
