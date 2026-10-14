import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from 'src/auth/types/auth-user.type';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async updateRole(params: { userId: number; role: Role }) {
    const { userId, role } = params;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) throw new BadRequestException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role,
        hashedRefreshToken: null, // ключевое: выкидываем со всех устройств
        tokenVersion: { increment: 1 },
      },
      select: { id: true, email: true, role: true },
    });

    return { before: user, after: updated };
  }
}
