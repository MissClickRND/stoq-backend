export type Role = 'ADMIN' | 'WAITER' | 'COOK' | 'CUSTOMER';

export type AuthUser = {
  id: number;
  email: string;
  role: Role;
};

export type AuthUserWithRefresh = AuthUser & {
  refreshToken: string;
};
