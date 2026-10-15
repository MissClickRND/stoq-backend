export const EXCHANGES = {
  COMMANDS: "app.commands",
  EVENTS: "app.events",
} as const;

export const QUEUES = {
  AUTH_COMMANDS: "auth.commands",
  AI_HEALTH: "ai.health",
  AI_COMMANDS: "ai.commands",
  ORDERS_COMMANDS: "orders.commands",
  CATALOG_COMMANDS: "catalog.commands",
  INVENTORY_COMMANDS: "inventory.commands",
  RECOMMENDATION_COMMANDS: "recommendation.commands",

  GATEWAY_EVENTS: "gateway.events",
  RECOMMENDATION_EVENTS: "recommendation.events",
} as const;

export const ROUTING_KEYS = {
  AUTH_ADMIN_STATISTICS: 'command.auth.admin_statistics',
  AUTH_ADMIN_USERS: 'command.auth.admin_users',
  AUTH_ADMIN_RESTAURANT: 'command.auth.admin_restaurant',
  AUTH_SET_USER_ROLE: 'command.auth.set_user_role',
  AUTH_SET_USER_BLOCK: 'command.auth.set_user_block',
  AUTH_LIST_INVITATIONS: 'command.auth.list_invitations',
  AUTH_CREATE_INVITATION: 'command.auth.create_invitation',
  AUTH_REVOKE_INVITATION: 'command.auth.revoke_invitation',
  AUTH_DELETE_INVITATION: 'command.auth.delete_invitation',
  AUTH_CREATE_DEMO_RESTAURANT: 'command.auth.create_demo_restaurant',
  AUTH_COMPLETE_DEMO_RESTAURANT: 'command.auth.complete_demo_restaurant',
  AUTH_LIST_DEMO_RESTAURANTS: 'command.auth.list_demo_restaurants',
  AUTH_DEMO_LOGIN: 'command.auth.demo_login',
  AUTH_GET_RESTAURANTS: 'command.auth.get_restaurants',
  AUTH_GET_RESTAURANT: 'command.auth.get_restaurant',
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
  UPDATE_SUPPLY: "command.inventory.update_supply",
  RESET_INVENTORY_DATA: "command.inventory.reset_business_data",
  RESET_CATALOG_DATA: "command.catalog.reset_business_data",
  RESET_ORDER_DATA: "command.order.reset_business_data",
  CHANGE_ORDER_STATUS: "command.order.change_status",

  AI_RECOGNIZE_UPD: "command.ai.recognize_upd",
  AI_HEALTH: "command.ai.health",

  CREATE_PRODUCT: "command.catalog.create_product", // POST /product
  CREATE_MANY_PRODUCT: "command.catalog.create_many_product", // POST /product/few
  GET_PRODUCT: "command.catalog.get_product", // GET /product
  GET_PRODUCT_BY_ID: "command.catalog.get_product_by_id", // GET /product/:id
  DEL_PRODUCT_BY_ID: "command.catalog.del_product_by_id", // DEL /product/:id

  RESOLVE_UPD_PRODUCTS: "command.catalog.resolve_upd_products",

  GET_UNIT: "command.catalog.get_unit", // GET /units/
  GET_UNIT_BY_ID: "command.catalog.get_unit_by_id", // GET /units/:id
  CREATE_UNIT: "command.catalog.create_unit", // POST /units

  CREATE_RECIPES: "command.catalog.create_recipes", // POST /product
  ADD_ITEM_TO_RECIPES: "command.catalog.add_item_to_recipes", // POST /product/few
  GET_RECIPES: "command.catalog.get_recipes", // GET /product
  GET_RECIPES_BY_ID: "command.catalog.get_recipes_by_id", // GET /product/:id
  DEL_RECIPES_BY_ID: "command.catalog.del_recipes_by_id", // DEL /product/:id

  CREATE_DISHES: "command.catalog.create_dishes", // POST /product
  CREATE_DISHES_MANY: "command.catalog.create_dishes_many",
  GET_DISHES: "command.catalog.get_dishes", // GET /product
  GET_DISHES_BY_ID: "command.catalog.get_dishes_by_id", // GET /product/:id
  DEL_DISHES_BY_ID: "command.catalog.del_dishes_by_id", // DEL /product/:id

  CREATE_ORDER: "command.order.create_order", // POST /orders
  ADD_DISH_TO_ORDER: "command.order.add_dish_to_order", // POST /orders/:id/items
  GET_ORDER: "command.order.get_order", // GET /orders
  GET_ORDER_BY_ID: "command.order.get_order_by_id", // GET /orders/:id
  DEL_ORDER_BY_ID: "command.order.del_order_by_id", // DEL /orders/:id
  GET_ORDERS_TODAY_STATISTICS: "command.order.get_today_statistics", // Internal order statistics query

  CREATE_SUPPLY: "command.inventory.create_supply", // POST /supplies
  GET_SUPPLY: "command.inventory.get_supply", // GET /supplies
  GET_SUPPLY_BY_ID: "command.inventory.get_supply_by_id", // GET /supplies/:id
  GET_SUPPLY_STATISTICS: 'command.inventory.get_supply_statistics',
  GET_INVENTORY_STATISTICS: 'command.inventory.get_statistics',
  GET_INVENTORY_WRITE_OFFS: 'command.inventory.get_write_offs',
  PREVIEW_INVENTORY: 'command.inventory.preview',

  GET_INVENTORY_STOCK: "command.inventory.get_stock", // Для остатков
  GET_INVENTORY: "command.inventory.get_inventory", // GET /inventory
  GET_INVENTORY_BY_ID: "command.inventory.get_inventory_by_id", // GET /inventory/:id
  GET_EXPIRING_INVENTORY: "command.inventory.get_expiring_inventory", // GET /inventory/expiring
  UPDATE_QUANTITY_INVENTORY: "command.inventory.update_quantity_inventory", // PUT /inventory

  DEDUCT_STOCK_INVENTORY: "command.inventory.deduct_stock_inventory",
  CHECK_STOCK_INVENTORY: "command.inventory.check_stock_inventory",
  EXPIRE_INVENTORY: "command.inventory.expire_inventory",

  GET_RECOMMENDATION: "command.recommendation.get_stop_list", // GET /recommendation
  GET_DISH_RECOMMENDATION: "command.recommendation.get_dish_recommendation", // GET /recommendations/dishes

  GET_DISH_STATISTICS: "command.recommendation.get_dish_statistics", // GET /statistics/dishes
  GET_DASHBOARD_STATISTICS: 'command.recommendation.get_dashboard_statistics',
  GET_DISH_DETAILS_STATISTICS: 'command.recommendation.get_dish_details_statistics',
  GET_SHORTAGE_STATISTICS: 'command.recommendation.get_shortage_statistics',
  GET_ORDER_STATISTICS_TODAY:
    "command.recommendation.get_order_statistics_today", // GET /statistics/orders/today

  GET_DEPENDENCY_GRAPH: "command.recommendation.get_dependency_graph", // GET /analytics/graph

  ORDER_CREATED: "order.created",
  STOP_LIST_UPDATED: "recommendation.stop_list.updated",
  STOCK_CHANGED: "inventory.stock.changed",
  BATCH_EXPIRED: "inventory.batch_expired",

  AUTH_COMMANDS_MASK: "command.auth.#",
  AI_COMMANDS_MASK: "command.ai.#",
  CATALOG_COMMANDS_MASK: "command.catalog.#",
  ORDERS_COMMANDS_MASK: "command.order.#",
  INVENTORY_COMMANDS_MASK: "command.inventory.#",
  RECOMMENDATION_COMMANDS_MASK: "command.recommendation.#",
} as const;
