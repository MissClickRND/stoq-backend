import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
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
        const email = dto.email;
        const user = await this.prisma.user.findUnique({
            where: {
                email,
            },
            select: {
                id: true,
                email: true,
                passwordHash: true,
                role: true,
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

        const safeUser = { id: user.id, email: user.email };
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
                email: true,
                hashedRefreshToken: true,
                role: true,
                tokenVersion: true,
            },
        });

        if (!user || !user.hashedRefreshToken)
            throw new ForbiddenException("Access Denied");

        const matches = await bcrypt.compare(
            refreshTokenFromCookie,
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
            user: { id: user.id, email: user.email, role: user.role },
            ...tokens,
        };
    }

    private async setRefreshTokenHash(userId: number, refreshToken: string) {
        const hash = await bcrypt.hash(refreshToken, 10);
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
                expiresIn: this.getAccessExpires(),
            }),
            this.jwt.signAsync(
                { sub: userId, email },
                {
                    secret: this.getRefreshSecret(),
                    expiresIn: this.getRefreshExpires(),
                },
            ),
        ]);
        return { accessToken, refreshToken };
    }
}
