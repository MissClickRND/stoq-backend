import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Res,
    UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ConfigService } from "@nestjs/config";
import { RegisterUserDto } from "./dto/register-user.dto";
import { clearAuthCookies, setAuthCookies } from "./auth.cookies";
import type { Response } from "express";
import { parseDurationMs } from "./utils/parse-duration-ms";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthUser, AuthUserWithRefresh } from "./types/auth-user.type";
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiCookieAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiOperation,
    ApiTags,
} from "@nestjs/swagger";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterRestaurantDto } from "./dto/register-restaurant.dto";
import { ApproveUserDto } from "./dto/approve-user.dto";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto";
import { RolesGuard } from "./guards/roles.guards";
import { Roles } from "./decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly config: ConfigService,
    ) {}

    private cookieSecure() {
        return (this.config.get<string>("COOKIE_SECURE") ?? "false") === "true";
    }

    private cookieSameSite(): "lax" | "strict" | "none" {
        const v = (
            this.config.get<string>("COOKIE_SAMESITE") ?? "lax"
        ).toLowerCase();
        if (v === "none" || v === "strict" || v === "lax") return v;
        return "lax";
    }

    private accessMaxAgeMs() {
        const v = this.config.get<string>("JWT_ACCESS_EXPIRES") ?? "15m";
        return parseDurationMs(v);
    }

    private refreshMaxAgeMs() {
        const v = this.config.get<string>("JWT_REFRESH_EXPIRES") ?? "7d";
        return parseDurationMs(v);
    }

    @Public()
    @Post("register-user")
    @ApiOperation({ summary: "Зарегистрировать сотрудника" })
    @ApiBody({ type: RegisterUserDto })
    @ApiCreatedResponse({
        description: "Заявка сотрудника создана и ожидает подтверждения",
    })
    @ApiBadRequestResponse({
        description:
            "Пользователь с таким email уже существует или данные невалидны",
    })
    register(@Body() dto: RegisterUserDto) {
        return this.auth.registerUser(dto);
    }

    @Public()
    @Post("register-restaurant")
    @ApiOperation({ summary: "Зарегистрировать ресторан" })
    @ApiBody({ type: RegisterRestaurantDto })
    @ApiCreatedResponse({
        description: "Ресторан и его администратор успешно зарегистрированы",
    })
    @ApiBadRequestResponse({
        description:
            "Пользователь с таким email уже существует или данные невалидны",
    })
    registerRestaurant(@Body() dto: RegisterRestaurantDto) {
        return this.auth.registerRestaurant(dto);
    }

    @Post("login")
    @Public()
    @ApiOperation({ summary: "Войти в систему" })
    @ApiBody({ type: LoginDto })
    @ApiCreatedResponse({
        description:
            "Вход выполнен; accessToken и refreshToken установлены в HttpOnly cookies",
    })
    @ApiBadRequestResponse({ description: "Неверный email или пароль" })
    @ApiForbiddenResponse({
        description: "Регистрация сотрудника ещё не подтверждена",
    })
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const result = await this.auth.login(dto);

        setAuthCookies({
            res,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            secure: this.cookieSecure(),
            sameSite: this.cookieSameSite(),
            accessMaxAgeMs: this.accessMaxAgeMs(),
            refreshMaxAgeMs: this.refreshMaxAgeMs(),
        });

        return { user: result.user };
    }

    @Get("admin/users/pending")
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: "Список сотрудников, ожидающих подтверждения" })
    getPendingEmployees(@CurrentUser() user: { id: number }) {
        return this.auth.getPendingUsers(user.id);
    }

    @Patch("admin/users/:id/approve")
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: "Подтвердить сотрудника и назначить роль" })
    approveEmployee(
        @CurrentUser() user: { id: number },
        @Param("id", ParseIntPipe) employeeId: number,
        @Body() dto: ApproveUserDto,
    ) {
        return this.auth.approveUser(user.id, employeeId, dto);
    }

    @Delete("admin/users/:id")
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: "Удалить сотрудника" })
    deleteEmployee(
        @CurrentUser() user: { id: number },
        @Param("id", ParseIntPipe) employeeId: number,
    ) {
        return this.auth.deleteUser(user.id, employeeId);
    }

    @Patch("admin/restaurant")
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: "Изменить информацию о своём ресторане" })
    updateRestaurant(
        @CurrentUser() user: { id: number },
        @Body() dto: UpdateRestaurantDto,
    ) {
        return this.auth.updateRestaurant(user.id, dto);
    }

    @Public()
    @ApiCookieAuth("accessToken")
    @UseGuards(JwtRefreshGuard)
    @Post("refresh")
    async refresh(
        @CurrentUser() user: AuthUserWithRefresh,
        @Res({ passthrough: true }) res: Response,
    ) {
        const result = await this.auth.refreshTokens(
            user.id,
            user.refreshToken,
        );

        setAuthCookies({
            res,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            secure: this.cookieSecure(),
            sameSite: this.cookieSameSite(),
            accessMaxAgeMs: this.accessMaxAgeMs(),
            refreshMaxAgeMs: this.refreshMaxAgeMs(),
        });

        return { user: result.user };
    }

    @ApiCookieAuth("accessToken")
    @Post("logout")
    async logout(
        @CurrentUser() user: AuthUser,
        @Res({ passthrough: true }) res: Response,
    ) {
        await this.auth.logout(user.id);

        clearAuthCookies(res, {
            secure: this.cookieSecure(),
            sameSite: this.cookieSameSite(),
        });

        return { ok: true };
    }

    @ApiCookieAuth("accessToken")
    @Get("status")
    status(@CurrentUser() user: AuthUser) {
        return { authenticated: true, user };
    }
}
