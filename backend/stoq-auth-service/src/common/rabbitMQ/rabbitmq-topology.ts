export const EXCHANGES = { COMMANDS: "app.commands" } as const;

export const QUEUES = { AUTH_COMMANDS: "auth.commands" } as const;

export const ROUTING_KEYS = {
  AUTH_REGISTER_USER: "command.auth.register_user",
  AUTH_REGISTER_RESTAURANT: "command.auth.register_restaurant",
  AUTH_LOGIN: "command.auth.login",
  AUTH_REFRESH: "command.auth.refresh",
  AUTH_LOGOUT: "command.auth.logout",
  AUTH_VERIFY_ACCESS: "command.auth.verify_access",
  AUTH_PENDING_USERS: "command.auth.pending_users",
  AUTH_APPROVE_USER: "command.auth.approve_user",
  AUTH_DELETE_USER: "command.auth.delete_user",
  AUTH_UPDATE_RESTAURANT: "command.auth.update_restaurant",
} as const;
