import type { JwtAccessPayload } from './jwt-access-payload';
import type { JwtRefreshPayload } from './jwt-refresh-payload';

declare global {
  namespace Express {
    interface User extends JwtAccessPayload, Partial<JwtRefreshPayload> {}
  }
}

export {};
