export type Role = 'ADMIN' | 'MANAGER' | 'WAITER' | 'STOREKEEPER' | 'WAIT_CONFIRM';

export type AuthUser = {
  id: number;
  email: string;
  role: Role;
  restaurantId: number;
  fullName: string;
};

export type AuthUserWithRefresh = Pick<AuthUser, 'id' | 'email'> & {
  refreshToken: string;
};
