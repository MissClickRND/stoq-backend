export const EXCHANGES = {
  COMMANDS: "app.commands",
  EVENTS: "app.events",
} as const;

export const QUEUES = {
  ORDERS_COMMANDS: "orders.commands",
  CATALOG_COMMANDS: "catalog.commands",
} as const;

export const ROUTING_KEYS = {
  CREATE_PRODUCT: "command.catalog.create_product", // POST /product
  CREATE_MANY_PRODUCT: "command.catalog.create_many_product", // POST /product/few
  GET_PRODUCT: "command.catalog.get_product", // GET /product
  GET_PRODUCT_BY_ID: "command.catalog.get_product_by_id", // GET /product/:id
  DEL_PRODUCT_BY_ID: "command.catalog.del_product_by_id", // DEL /product/:id

  CREATE_UNIT: "command.catalog.create_unit", // POST /product/:id

  CREATE_RECIPES: "command.catalog.create_recipes", // POST /product
  ADD_ITEM_TO_RECIPES: "command.catalog.add_item_to_recipes", // POST /product/few
  GET_RECIPES: "command.catalog.get_recipes", // GET /product
  GET_RECIPES_BY_ID: "command.catalog.get_recipes_by_id", // GET /product/:id
  DEL_RECIPES_BY_ID: "command.catalog.del_recipes_by_id", // DEL /product/:id

  CREATE_DISHES: "command.catalog.create_dishes", // POST /product
  GET_DISHES: "command.catalog.get_dishes", // GET /product
  GET_DISHES_BY_ID: "command.catalog.get_dishes_by_id", // GET /product/:id
  DEL_DISHES_BY_ID: "command.catalog.del_dishes_by_id", // DEL /product/:id

  // GET_PRODUCT_BY_ID: 'command.catalog.create_product', // GET /product/:id
  // CREATE_PRODUCT: 'command.catalog.create_product', // GET /product/:id

  // CREATE_ORDER: 'command.order.create',

  CATALOG_COMMANDS_MASK: "command.catalog.#",
  ORDERS_COMMANDS_MASK: "command.order.#",
} as const;
