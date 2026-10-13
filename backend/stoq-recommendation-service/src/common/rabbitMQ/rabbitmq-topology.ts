export const EXCHANGES = {
  COMMANDS: 'app.commands',
  EVENTS: 'app.events',
} as const;

export const QUEUES = {
  AI_COMMANDS: 'ai.commands',
  AI_HEALTH: 'ai.health',
  ORDERS_COMMANDS: 'orders.commands',
  CATALOG_COMMANDS: 'catalog.commands',
  INVENTORY_COMMANDS: 'inventory.commands',
  RECOMMENDATION_COMMANDS: 'recommendation.commands',
} as const;

export const ROUTING_KEYS = {
  RECOGNIZE_UPD: 'command.ai.recognize_upd',
  AI_HEALTH: 'command.ai.health',

  CREATE_PRODUCT: 'command.catalog.create_product', // POST /product
  CREATE_MANY_PRODUCT: 'command.catalog.create_many_product', // POST /product/few
  GET_PRODUCT: 'command.catalog.get_product', // GET /product
  GET_PRODUCT_BY_ID: 'command.catalog.get_product_by_id', // GET /product/:id
  DEL_PRODUCT_BY_ID: 'command.catalog.del_product_by_id', // DEL /product/:id

  GET_UNIT: 'command.catalog.get_unit', // GET /units/
  GET_UNIT_BY_ID: 'command.catalog.get_unit_by_id', // GET /units/:id
  CREATE_UNIT: 'command.catalog.create_unit', // POST /units

  CREATE_RECIPES: 'command.catalog.create_recipes', // POST /product
  ADD_ITEM_TO_RECIPES: 'command.catalog.add_item_to_recipes', // POST /product/few
  GET_RECIPES: 'command.catalog.get_recipes', // GET /product
  GET_RECIPES_BY_ID: 'command.catalog.get_recipes_by_id', // GET /product/:id
  DEL_RECIPES_BY_ID: 'command.catalog.del_recipes_by_id', // DEL /product/:id

  CREATE_DISHES: 'command.catalog.create_dishes', // POST /product
  GET_DISHES: 'command.catalog.get_dishes', // GET /product
  GET_DISHES_BY_ID: 'command.catalog.get_dishes_by_id', // GET /product/:id
  DEL_DISHES_BY_ID: 'command.catalog.del_dishes_by_id', // DEL /product/:id

  CREATE_ORDER: 'command.order.create_order', // POST /orders
  ADD_DISH_TO_ORDER: 'command.order.add_dish_to_order', // POST /orders/:id/items
  GET_ORDER: 'command.order.get_order', // GET /orders
  GET_ORDER_BY_ID: 'command.order.get_order_by_id', // GET /orders/:id
  DEL_ORDER_BY_ID: 'command.order.del_order_by_id', // DEL /orders/:id

  CREATE_SUPPLY: 'command.inventory.create_supply', // POST /supplies
  GET_SUPPLY: 'command.inventory.get_supply', // GET /supplies
  GET_SUPPLY_BY_ID: 'command.inventory.get_supply_by_id', // GET /supplies/:id

  GET_INVENTORY: 'command.inventory.get_inventory', // GET /inventory
  GET_INVENTORY_BY_ID: 'command.inventory.get_inventory_by_id', // GET /inventory/:id
  UPDATE_QUANTITY_INVENTORY: 'command.inventory.update_quantity_inventory', // PUT /inventory

  GET_RECOMMENDATION: 'command.recommendation.get_recommendation', // GET /recommendation

  AI_COMMANDS_MASK: 'command.ai.#',
  CATALOG_COMMANDS_MASK: 'command.catalog.#',
  ORDERS_COMMANDS_MASK: 'command.order.#',
  INVENTORY_COMMANDS_MASK: 'command.inventory.#',
  RECOMMENDATION_COMMANDS_MASK: 'command.recommendation.#',
} as const;
