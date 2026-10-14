export const EXCHANGES = {
  COMMANDS: "app.commands",
  EVENTS: "app.events",
} as const;

export const QUEUES = {
  AI_HEALTH: "ai.health",
  AI_COMMANDS: "ai.commands",
  ORDERS_COMMANDS: "orders.commands",
  CATALOG_COMMANDS: "catalog.commands",
  INVENTORY_COMMANDS: "inventory.commands",
  RECOMMENDATION_COMMANDS: "recommendation.commands",

  RECOMMENDATION_EVENTS: "recommendation.events",
  GATEWAY_RECOMMENDATION_EVENTS: "gateway.recommendation.events",
} as const;

export const ROUTING_KEYS = {
  CHANGE_ORDER_STATUS: "command.order.change_status",

  AI_RECOGNIZE_UPD: "command.ai.recognize_upd",
  AI_HEALTH: "command.ai.health",

  CREATE_PRODUCT: "command.catalog.create_product", // POST /product
  CREATE_MANY_PRODUCT: "command.catalog.create_many_product", // POST /product/few
  GET_PRODUCT: "command.catalog.get_product", // GET /product
  GET_PRODUCT_BY_ID: "command.catalog.get_product_by_id", // GET /product/:id
  DEL_PRODUCT_BY_ID: "command.catalog.del_product_by_id", // DEL /product/:id

  GET_UNIT: "command.catalog.get_unit", // GET /units/
  GET_UNIT_BY_ID: "command.catalog.get_unit_by_id", // GET /units/:id
  CREATE_UNIT: "command.catalog.create_unit", // POST /units

  CREATE_RECIPES: "command.catalog.create_recipes", // POST /product
  ADD_ITEM_TO_RECIPES: "command.catalog.add_item_to_recipes", // POST /product/few
  GET_RECIPES: "command.catalog.get_recipes", // GET /product
  GET_RECIPES_BY_ID: "command.catalog.get_recipes_by_id", // GET /product/:id
  DEL_RECIPES_BY_ID: "command.catalog.del_recipes_by_id", // DEL /product/:id

  CREATE_DISHES: "command.catalog.create_dishes", // POST /product
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

  GET_INVENTORY: "command.inventory.get_inventory", // GET /inventory
  GET_INVENTORY_BY_ID: "command.inventory.get_inventory_by_id", // GET /inventory/:id
  UPDATE_QUANTITY_INVENTORY: "command.inventory.update_quantity_inventory", // PUT /inventory

  GET_INVENTORY_STOCK: "command.inventory.get_stock", // Для остатков

  GET_RECOMMENDATION: "command.recommendation.get_recommendation", // GET /recommendation
  GET_DISH_RECOMMENDATION: "command.recommendation.get_dish_recommendation", // POST /recommendation/dishes

  GET_DISH_STATISTICS: "command.recommendation.get_dish_statistics", // GET /statistics/dishes
  GET_ORDER_STATISTICS_TODAY:
    "command.recommendation.get_order_statistics_today", // GET /statistics/orders/today

  GET_DEPENDENCY_GRAPH: "command.recommendation.get_dependency_graph", // GET /analytics/graph

  CATALOG_DISHES_SNAPSHOT: "event.catalog.dishes.snapshot",
  CATALOG_DISH_UPDATED: "event.catalog.dish.updated",
  CATALOG_DISH_DELETED: "event.catalog.dish.deleted",

  INVENTORY_BATCHES_SNAPSHOT: "event.inventory.batches.snapshot",
  INVENTORY_STOCK_CHANGED: "event.inventory.stock.changed",

  RECOMMENDATION_UPDATED: "event.recommendation.updated",

  AI_COMMANDS_MASK: "command.ai.#",
  CATALOG_COMMANDS_MASK: "command.catalog.#",
  ORDERS_COMMANDS_MASK: "command.order.#",
  INVENTORY_COMMANDS_MASK: "command.inventory.#",
  RECOMMENDATION_COMMANDS_MASK: "command.recommendation.#",
} as const;
