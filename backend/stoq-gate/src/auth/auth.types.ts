export const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  WAITER: 'WAITER',
  STOREKEEPER: 'STOREKEEPER',
  WAIT_CONFIRM: 'WAIT_CONFIRM',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const FULL_ACCESS: Role[] = [Role.ADMIN, Role.MANAGER];
export const OPERATIONS: Role[] = [...FULL_ACCESS, Role.WAITER];
export const STAFF: Role[] = [...OPERATIONS, Role.STOREKEEPER];

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  restaurantId: number;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}
