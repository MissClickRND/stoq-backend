import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { CommandBusModule } from '../common/rabbitMQ/command-bus.module';
import { AuthRPCController } from './auth-rpc.controller';

@Module({
  imports: [PassportModule, JwtModule.register({}), CommandBusModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy, AuthRPCController],
})
export class AuthModule {}
