import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getAccessSecret() {
    return this.config.get<string>('JWT_ACCESS_SECRET', { infer: true })!;
  }

  private getRefreshSecret() {
    return this.config.get<string>('JWT_REFRESH_SECRET', { infer: true })!;
  }

  private getAccessExpires() {
    return (this.config.get('JWT_ACCESS_EXPIRES') ?? '15m') as StringValue;
  }

  private getRefreshExpires() {
    return (this.config.get('JWT_REFRESH_EXPIRES') ?? '7d') as StringValue;
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        email: true,
        id: true,
        role: true,
        tokenVersion: true,
      },
    });

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

  async login(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
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

    if (!user) throw new BadRequestException('Пользователь не найден');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new BadRequestException('Неверный пароль');

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
      throw new ForbiddenException('Access Denied');

    const matches = await bcrypt.compare(
      refreshTokenFromCookie,
      user.hashedRefreshToken,
    );
    if (!matches) throw new ForbiddenException('Access Denied');

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
