import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "src/prisma/prisma.service";
import { RegisterUserDto } from "./dto/register-user.dto";
import * as bcrypt from "bcrypt";
import type { StringValue } from "ms";
import { Role } from "@prisma/client";
import { LoginDto } from "./dto/login.dto";
import { RegisterRestaurantDto } from "./dto/register-restaurant.dto";
import { ApproveUserDto } from "./dto/approve-user.dto";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto";
import { createHash, randomUUID } from 'node:crypto';
import { parseDurationMs } from './utils/parse-duration-ms';
import type { AuthUser } from './types/auth-user.type';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
    ) {}

    private getAccessSecret() {
        return this.config.get<string>("JWT_ACCESS_SECRET", { infer: true })!;
    }

    private getRefreshSecret() {
        return this.config.get<string>("JWT_REFRESH_SECRET", { infer: true })!;
    }

    private getAccessExpires() {
        return (this.config.get("JWT_ACCESS_EXPIRES") ?? "15m") as StringValue;
    }

    private getRefreshExpires() {
        return (this.config.get("JWT_REFRESH_EXPIRES") ?? "7d") as StringValue;
    }

    async registerUser(dto: RegisterUserDto) {
        const email = dto.email.toLowerCase().trim();

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new BadRequestException("Пользователь уже существует");
        }

        const restaurant = await this.prisma.restaurant.findUnique({
            where: { id: dto.restaurantId },
        });

        if (!restaurant) {
            throw new BadRequestException("Ресторан не найден");
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);

        const user = await this.prisma.user.create({
            data: {
                fullName: dto.fullName,
                email,
                passwordHash,
                role: Role.WAIT_CONFIRM,
                restaurantId: dto.restaurantId,
            },
            select: {
                id: true,
                email: true,
                role: true,
                restaurantId: true,
            },
        });

        return {
            message: "Регистрация отправлена на подтверждение",
            user,
        };
    }

    getRestaurants() {
        return this.prisma.restaurant.findMany({ select: { id: true, name: true, address: true }, orderBy: { id: 'asc' } });
    }

    async getRestaurant(id: number) {
        if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Некорректный ID ресторана');
        const restaurant = await this.prisma.restaurant.findUnique({ where: { id }, select: { id: true, name: true, address: true } });
        if (!restaurant) throw new NotFoundException('Ресторан не найден');
        return restaurant;
    }

    async registerRestaurant(dto: RegisterRestaurantDto) {
        const email = dto.email.toLowerCase().trim();

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new BadRequestException("Пользователь уже существует");
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);

        const result = await this.prisma.$transaction(async (tx) => {
            const restaurant = await tx.restaurant.create({
                data: {
                    name: dto.restaurantName,
                    address: dto.restaurantAddress ?? "",
                },
            });

            const user = await tx.user.create({
                data: {
                    fullName: dto.fullName,
                    email,
                    passwordHash,
                    role: Role.ADMIN,
                    restaurantId: restaurant.id,
                },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    restaurantId: true,
                },
            });

            return { user, restaurant };
        });

        return {
            message: "Ресторан успешно зарегистрирован",
            ...result,
        };
    }

    async login(dto: LoginDto) {
        const email = dto.email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({
            where: {
                email,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                passwordHash: true,
                role: true,
                restaurantId: true,
                tokenVersion: true,
            },
        });

        if (!user) throw new BadRequestException("Неверный email или пароль");

        const ok = await bcrypt.compare(dto.password, user.passwordHash);
        if (!ok) throw new BadRequestException("Неверный email или пароль");

        if (user.role === Role.WAIT_CONFIRM) {
            throw new ForbiddenException(
                "Ваша регистрация ещё не подтверждена",
            );
        }

        const safeUser = { id: user.id, fullName: user.fullName, email: user.email, role: user.role, restaurantId: user.restaurantId };
        const tokens = await this.issueTokens(
            user.id,
            user.email,
            user.role,
            user.tokenVersion,
        );
        await this.setRefreshTokenHash(user.id, tokens.refreshToken);

        return { user: safeUser, ...tokens };
    }

    async logout(userId: number) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { hashedRefreshToken: null, tokenVersion: { increment: 1 } },
        });

        return { ok: true };
    }

    async getPendingUsers(adminId: number) {
        const admin = await this.prisma.user.findUnique({
            where: {
                id: adminId,
            },
            select: {
                role: true,
                restaurantId: true,
            },
        });

        if (!admin || admin.role !== Role.ADMIN) {
            throw new ForbiddenException("Недостаточно прав");
        }

        return this.prisma.user.findMany({
            where: {
                restaurantId: admin.restaurantId,
                role: Role.WAIT_CONFIRM,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                createdAt: true,
            },
            orderBy: { createdAt: "asc" },
        });
    }

    async approveUser(adminId: number, userId: number, dto: ApproveUserDto) {
        const admin = await this.prisma.user.findUnique({
            where: {
                id: adminId,
            },
            select: {
                role: true,
                restaurantId: true,
            },
        });

        if (!admin || admin.role !== Role.ADMIN) {
            throw new ForbiddenException("Недостаточно прав");
        }

        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                restaurantId: admin.restaurantId,
                role: Role.WAIT_CONFIRM,
            },
        });

        if (!user) {
            throw new NotFoundException(
                "Ожидающий подтверждения сотрудник не найден",
            );
        }

        return this.prisma.user.update({
            where: {
                id: userId,
            },
            data: {
                role: dto.role,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
            },
        });
    }

    async deleteUser(adminId: number, userId: number) {
        const admin = await this.prisma.user.findUnique({
            where: {
                id: adminId,
            },
            select: {
                role: true,
                restaurantId: true,
            },
        });

        if (!admin || admin.role !== Role.ADMIN) {
            throw new ForbiddenException("Недостаточно прав");
        }

        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                restaurantId: admin.restaurantId,
                role: {
                    in: [
                        Role.WAIT_CONFIRM,
                        Role.MANAGER,
                        Role.WAITER,
                        Role.STOREKEEPER,
                    ],
                },
            },
        });

        if (!user) {
            throw new NotFoundException("Сотрудник не найден");
        }

        await this.prisma.user.delete({
            where: {
                id: userId,
            },
        });

        return { message: "Сотрудник удалён" };
    }

    async updateRestaurant(adminId: number, dto: UpdateRestaurantDto) {
        const admin = await this.prisma.user.findUnique({
            where: {
                id: adminId,
            },
            select: {
                role: true,
                restaurantId: true,
            },
        });

        if (!admin || admin.role !== Role.ADMIN) {
            throw new ForbiddenException("Недостаточно прав");
        }

        const data = Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined),
        );

        return this.prisma.restaurant.update({
            where: { id: admin.restaurantId },
            data,
        });
    }

    async refreshTokens(userId: number, refreshTokenFromCookie: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                fullName: true,
                email: true,
                hashedRefreshToken: true,
                role: true,
                restaurantId: true,
                tokenVersion: true,
            },
        });

        if (!user || !user.hashedRefreshToken || user.role === Role.WAIT_CONFIRM)
            throw new ForbiddenException("Access Denied");

        const matches = await bcrypt.compare(
            this.refreshDigest(refreshTokenFromCookie),
            user.hashedRefreshToken,
        );
        if (!matches) throw new ForbiddenException("Access Denied");

        const tokens = await this.issueTokens(
            user.id,
            user.email,
            user.role,
            user.tokenVersion,
        );

        await this.setRefreshTokenHash(user.id, tokens.refreshToken);

        return {
            user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, restaurantId: user.restaurantId },
            ...tokens,
        };
    }

    private async setRefreshTokenHash(userId: number, refreshToken: string) {
        const hash = await bcrypt.hash(this.refreshDigest(refreshToken), 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { hashedRefreshToken: hash },
        });
    }

    private async issueTokens(
        userId: number,
        email: string,
        role: string,
        tokenVersion: number,
    ) {
        const payload = { sub: userId, email, role, tokenVersion };

        const [accessToken, refreshToken] = await Promise.all([
            this.jwt.signAsync(payload, {
                secret: this.getAccessSecret(),
                expiresIn: parseDurationMs(this.getAccessExpires()) / 1000,
            }),
            this.jwt.signAsync(
                { sub: userId, email, tokenVersion, jti: randomUUID() },
                {
                    secret: this.getRefreshSecret(),
                    expiresIn: parseDurationMs(this.getRefreshExpires()) / 1000,
                },
            ),
        ]);
        return {
            accessToken, refreshToken,
            accessMaxAgeMs: parseDurationMs(this.getAccessExpires()),
            refreshMaxAgeMs: parseDurationMs(this.getRefreshExpires()),
        };
    }

    private refreshDigest(token: string) {
        // bcrypt only considers the first 72 bytes; digest the complete JWT before hashing.
        return createHash('sha256').update(token).digest('hex');
    }

    async validateAccessPayload(payload: { sub: number; tokenVersion: number }): Promise<AuthUser> {
        if (!Number.isSafeInteger(payload?.sub) || !Number.isInteger(payload.tokenVersion)) {
            throw new UnauthorizedException('Недействительный токен');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, fullName: true, role: true, restaurantId: true, tokenVersion: true },
        });
        if (!user || user.tokenVersion !== payload.tokenVersion || user.role === Role.WAIT_CONFIRM) {
            throw new UnauthorizedException('Сессия недействительна');
        }
        return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, restaurantId: user.restaurantId };
    }

    async verifyAccessToken(accessToken: string): Promise<AuthUser> {
        let payload: { sub: number; tokenVersion: number };
        try {
            if (typeof accessToken !== 'string' || !accessToken) throw new Error();
            payload = await this.jwt.verifyAsync(accessToken, { secret: this.getAccessSecret(), algorithms: ['HS256'] });
        } catch {
            throw new UnauthorizedException('Недействительный или просроченный токен');
        }
        return this.validateAccessPayload(payload);
    }

    async refreshByToken(refreshToken: string) {
        let payload: { sub: number; tokenVersion: number };
        try {
            if (typeof refreshToken !== 'string' || !refreshToken) throw new Error();
            payload = await this.jwt.verifyAsync(refreshToken, { secret: this.getRefreshSecret(), algorithms: ['HS256'] });
        } catch {
            throw new UnauthorizedException('Недействительный или просроченный refresh-токен');
        }
        await this.validateAccessPayload(payload);
        return this.refreshTokens(payload.sub, refreshToken);
    }
}
