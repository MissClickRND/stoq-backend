export const EXCHANGES = {
  COMMANDS: "app.commands",
  EVENTS: "app.events",
} as const;
export const QUEUES = {
  STOCK: "telegram.stock.events",
  EXPIRY: "telegram.expired.events",
  STATUS: "telegram.status.events",
} as const;
export const ROUTING_KEYS = {
  AUTH_TELEGRAM_LOGIN: "command.auth.telegram_login",
  AUTH_TELEGRAM_VERIFY: "command.auth.telegram_verify",
  AUTH_TELEGRAM_LOGOUT: "command.auth.telegram_logout",
  GET_DAILY_STATISTICS: "command.recommendation.get_daily_statistics",
  STOCK_CHANGED: "inventory.stock.changed",
  BATCH_EXPIRED: "inventory.batch_expired",
  STOP_LIST_UPDATED: "recommendation.stop_list.updated",
} as const;
