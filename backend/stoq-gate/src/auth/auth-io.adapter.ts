import type { INestApplicationContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AuthService } from './auth.service';
import { accessTokenFrom } from './access-token';
import { OPERATIONS, STAFF } from './auth.types';
import { corsOptions } from '../cors-options';

export class AuthIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly auth: AuthService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: any) {
    return super.createIOServer(port, { ...options, cors: corsOptions });
  }

  create(
    port: number,
    options?: Parameters<IoAdapter['create']>[1],
  ): ReturnType<IoAdapter['create']> {
    const server = super.create(port, options);
    if (options?.namespace) {
      server.use(async (socket, next) => {
        const token =
          accessTokenFrom(socket.handshake.headers) ??
          socket.handshake.auth?.accessToken;
        const verify = async () => {
          const user = await this.auth.verifyAccess(
            typeof token === 'string' ? token : undefined,
          );
          const roles = options.namespace === '/inventory' ? STAFF : OPERATIONS;
          if (!roles.includes(user.role))
            throw new ForbiddenException('Недостаточно прав');
          socket.data.user = user;
        };
        try {
          await verify();
        } catch {
          next(
            new Error(
              'Требуется действующая сессия сотрудника с доступом к разделу',
            ),
          );
          return;
        }
        // Authenticate before joining the namespace, including its broadcast recipients.
        socket.use(async (_packet, done) => {
          try {
            await verify();
            done();
          } catch {
            done(new Error('Сессия недействительна'));
            socket.disconnect(true);
          }
        });
        let checking = false;
        const timer = setInterval(async () => {
          if (checking) return;
          checking = true;
          try {
            await verify();
          } catch {
            socket.disconnect(true);
          } finally {
            checking = false;
          }
        }, 15000);
        timer.unref();
        socket.once('disconnect', () => clearInterval(timer));
        next();
      });
    }
    return server;
  }
}
