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
import { Prisma, Role } from "@prisma/client";
import { LoginDto } from "./dto/login.dto";
import { RegisterRestaurantDto } from "./dto/register-restaurant.dto";
import { ApproveUserDto } from "./dto/approve-user.dto";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto";
import { createHash, randomUUID } from 'node:crypto';
import { parseDurationMs } from './utils/parse-duration-ms';
import type { AuthUser } from './types/auth-user.type';
import { ACTIVE_ROLES, CreateInvitationDto, SetUserBlockDto, SetUserRoleDto } from './dto/admin.dto';

const employeeSelect = { id: true, fullName: true, email: true, role: true, restaurantId: true, blocked: true, createdAt: true } as const;
const accountSelect = { id: true, fullName: true, email: true, role: true, restaurantId: true } as const;

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

        const createUser = (tx: Prisma.TransactionClient, role: Role) => tx.user.create({
            data: {
                fullName: dto.fullName,
                email,
                passwordHash,
                role,
                restaurantId: dto.restaurantId,
            },
            select: {
                id: true,
                email: true,
                role: true,
                restaurantId: true,
            },
        });

        const user = dto.invitationId
            ? await this.prisma.$transaction(async (tx) => {
                // Claim atomically before creating the account; failed account creation rolls this back.
                const claimed = await tx.invitation.updateMany({
                    where: { id: dto.invitationId, restaurantId: dto.restaurantId, revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
                    data: { usedAt: new Date() },
                });
                if (claimed.count !== 1) throw new BadRequestException('Приглашение недействительно или уже использовано');
                const invitation = await tx.invitation.findUniqueOrThrow({ where: { id: dto.invitationId } });
                return createUser(tx, invitation.role);
            })
            : await createUser(this.prisma, Role.WAIT_CONFIRM);

        return {
            message: dto.invitationId ? 'Регистрация по приглашению завершена' : "Регистрация отправлена на подтверждение",
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
                blocked: true,
            },
        });

        if (!user) throw new BadRequestException("Неверный email или пароль");

        const ok = await bcrypt.compare(dto.password, user.passwordHash);
        if (!ok) throw new BadRequestException("Неверный email или пароль");

        if (user.blocked) throw new ForbiddenException('Аккаунт заблокирован');

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

    private async requireAdmin(adminId: number, tx: Prisma.TransactionClient = this.prisma) {
        const admin = await tx.user.findUnique({ where: { id: adminId }, select: { id: true, role: true, restaurantId: true, blocked: true } });
        if (!admin || admin.blocked || admin.role !== Role.ADMIN) throw new ForbiddenException('Недостаточно прав');
        return admin;
    }

    private employeeStatus<T extends { role: Role; blocked: boolean }>(user: T) {
        return { ...user, status: user.blocked ? 'blocked' : user.role === Role.WAIT_CONFIRM ? 'pending' : 'active' };
    }

    async getAdminUsers(adminId: number) {
        const admin = await this.requireAdmin(adminId);
        const users = await this.prisma.user.findMany({ where: { restaurantId: admin.restaurantId }, select: employeeSelect, orderBy: { createdAt: 'asc' } });
        return users.map((user) => this.employeeStatus(user));
    }

    async getAdminRestaurant(adminId: number) {
        const admin = await this.requireAdmin(adminId);
        return this.prisma.restaurant.findUniqueOrThrow({ where: { id: admin.restaurantId }, select: { id: true, name: true, address: true, phone: true, email: true } });
    }

    async setUserRole(adminId: number, userId: number, dto: SetUserRoleDto) {
        if (!ACTIVE_ROLES.includes(dto.role)) throw new BadRequestException('Недопустимая роль сотрудника');
        return this.changeEmployee(adminId, userId, { role: dto.role });
    }

    async setUserBlock(adminId: number, userId: number, dto: SetUserBlockDto) {
        if (typeof dto.blocked !== 'boolean') throw new BadRequestException('Некорректный статус блокировки');
        return this.changeEmployee(adminId, userId, { blocked: dto.blocked });
    }

    private async changeEmployee(adminId: number, userId: number, change: { role?: Role; blocked?: boolean }) {
        // Serializable transactions also protect against two administrators concurrently removing each other's access.
        return this.prisma.$transaction(async (tx) => {
            const admin = await this.requireAdmin(adminId, tx);
            const user = await tx.user.findFirst({ where: { id: userId, restaurantId: admin.restaurantId }, select: employeeSelect });
            if (!user) throw new NotFoundException('Сотрудник не найден');
            const removesAdmin = change.blocked === true || (change.role !== undefined && change.role !== Role.ADMIN);
            if (user.id === adminId && removesAdmin) throw new BadRequestException('Нельзя лишить себя доступа администратора');
            if (user.role === Role.ADMIN && !user.blocked && removesAdmin) {
                const admins = await tx.user.count({ where: { restaurantId: admin.restaurantId, role: Role.ADMIN, blocked: false } });
                if (admins <= 1) throw new BadRequestException('В ресторане должен остаться активный администратор');
            }
            const updated = await tx.user.update({ where: { id: userId }, data: { ...change, tokenVersion: { increment: 1 }, hashedRefreshToken: null }, select: employeeSelect });
            return this.employeeStatus(updated);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    private invitationStatus<T extends { revokedAt: Date | null; usedAt: Date | null; expiresAt: Date }>(invitation: T) {
        return { ...invitation, status: invitation.revokedAt ? 'revoked' : invitation.usedAt ? 'used' : invitation.expiresAt <= new Date() ? 'expired' : 'active' };
    }

    async getInvitations(adminId: number) {
        const admin = await this.requireAdmin(adminId);
        const invitations = await this.prisma.invitation.findMany({ where: { restaurantId: admin.restaurantId }, orderBy: { createdAt: 'desc' } });
        return invitations.map((invitation) => this.invitationStatus(invitation));
    }

    async createInvitation(adminId: number, dto: CreateInvitationDto) {
        const admin = await this.requireAdmin(adminId);
        if (!ACTIVE_ROLES.includes(dto.role) || !Number.isInteger(dto.hours) || dto.hours < 1 || dto.hours > 720) throw new BadRequestException('Некорректные параметры приглашения');
        const invitation = await this.prisma.invitation.create({ data: { restaurantId: admin.restaurantId, role: dto.role, expiresAt: new Date(Date.now() + dto.hours * 3600000) } });
        return this.invitationStatus(invitation);
    }

    async revokeInvitation(adminId: number, id: string) {
        const admin = await this.requireAdmin(adminId);
        // Scope the mutation itself, so an unrelated invitation ID can never be changed.
        const result = await this.prisma.invitation.updateMany({ where: { id, restaurantId: admin.restaurantId }, data: { revokedAt: new Date() } });
        if (!result.count) throw new NotFoundException('Приглашение не найдено');
        return { ok: true };
    }

    async deleteInvitation(adminId: number, id: string) {
        const admin = await this.requireAdmin(adminId);
        const result = await this.prisma.invitation.deleteMany({ where: { id, restaurantId: admin.restaurantId } });
        if (!result.count) throw new NotFoundException('Приглашение не найдено');
        return { ok: true };
    }

    private requireTestTools() {
        if (this.config.get('ENABLE_TEST_TOOLS') !== 'true' && this.config.get('NODE_ENV') === 'production') throw new NotFoundException('Тестовые инструменты отключены');
    }

    async createDemoRestaurant(adminId: number) {
        this.requireTestTools();
        await this.requireAdmin(adminId);
        const suffix = randomUUID();
        const passwordHash = await bcrypt.hash(randomUUID(), 10);
        return this.prisma.$transaction(async (tx) => {
            const restaurant = await tx.restaurant.create({ data: { name: `Демо-ресторан ${suffix.slice(0, 8)}`, address: 'Демонстрационные данные', isDemo: true }, select: { id: true, name: true, address: true, isDemo: true, demoReady: true } });
            const accounts: AuthUser[] = [];
            for (const role of ACTIVE_ROLES) {
                accounts.push(await tx.user.create({ data: { fullName: `Демо ${role}`, email: `demo-${suffix}-${role.toLowerCase()}@example.invalid`, passwordHash, role, restaurantId: restaurant.id }, select: accountSelect }));
            }
            return { restaurant, accounts };
        });
    }

    async listDemoRestaurants() {
        this.requireTestTools();
        const restaurants = await this.prisma.restaurant.findMany({ where: { isDemo: true, demoReady: true }, select: { id: true, name: true, address: true, isDemo: true, users: { where: { blocked: false, role: { in: ACTIVE_ROLES } }, select: accountSelect } }, orderBy: { createdAt: 'desc' } });
        return restaurants.map(({ users, ...restaurant }) => ({ ...restaurant, accounts: users }));
    }

    async demoLogin(restaurantId: number, role: Role) {
        this.requireTestTools();
        if (!Number.isSafeInteger(restaurantId) || restaurantId < 1 || !ACTIVE_ROLES.includes(role)) throw new BadRequestException('Некорректный ресторан или роль');
        const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, isDemo: true, demoReady: true } });
        if (!restaurant?.isDemo || !restaurant.demoReady) throw new NotFoundException('Демо-ресторан не найден');
        const user = await this.prisma.user.findFirst({ where: { restaurantId, role, blocked: false }, select: { ...accountSelect, tokenVersion: true }, orderBy: { id: 'asc' } });
        if (!user) throw new NotFoundException('Демо-аккаунт не найден');
        const tokens = await this.issueTokens(user.id, user.email, user.role, user.tokenVersion);
        await this.setRefreshTokenHash(user.id, tokens.refreshToken);
        const { tokenVersion, ...safeUser } = user;
        return { user: safeUser, ...tokens };
    }

    async completeDemoRestaurant(adminId: number, restaurantId: number) {
        this.requireTestTools();
        await this.requireAdmin(adminId);
        if (!Number.isSafeInteger(restaurantId) || restaurantId < 1) throw new BadRequestException('Некорректный ID ресторана');
        const result = await this.prisma.restaurant.updateMany({ where: { id: restaurantId, isDemo: true }, data: { demoReady: true } });
        if (!result.count) throw new NotFoundException('Демо-ресторан не найден');
        return { ok: true };
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
                blocked: true,
            },
        });

        if (!user || user.blocked || !user.hashedRefreshToken || user.role === Role.WAIT_CONFIRM)
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
            select: { id: true, email: true, fullName: true, role: true, restaurantId: true, tokenVersion: true, blocked: true },
        });
        if (!user || user.blocked || user.tokenVersion !== payload.tokenVersion || user.role === Role.WAIT_CONFIRM) {
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
