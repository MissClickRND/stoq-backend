export type Role = 'ADMIN' | 'MANAGER' | 'WAITER' | 'STOREKEEPER' | 'WAIT_CONFIRM';

export type AuthUser = {
  id: number;
  email: string;
  role: Role;
};

export type AuthUserWithRefresh = AuthUser & {
  refreshToken: string;
};
