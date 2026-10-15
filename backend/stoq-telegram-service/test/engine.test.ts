import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/engine";
import { SessionCipher, RpcFailure } from "../src/core";
const cipher = new SessionCipher(Buffer.alloc(32, 1).toString("base64"));
function setup() {
  const state: any = {
    binding: null,
    intents: [],
    deleted: false,
    sent: [],
    calls: [],
    removed: false,
    preferences: [],
  };
  const store: any = {
    binding: async () => state.binding,
    saveBinding: async (b: any) => {
      state.binding = b;
    },
    remove: async () => {
      state.removed = true;
      state.binding = null;
    },
    enqueue: async (...args: any[]) => {
      state.intents.push(args);
    },
    preference: async (...args: any[]) => state.preferences.push(args),
    daily: async () => {},
  };
  const bus: any = {
    sendCommand: async (_e: string, key: string, p: any) => {
      state.calls.push([key, p]);
      if (key.endsWith("telegram_login")) {
        assert.equal(state.deleted, true);
        return {
          success: true,
          data: {
            user: { id: 1, restaurantId: 2, role: "ADMIN" },
            sessionToken: "secret",
            expiresAt: "2099-01-01T00:00:00Z",
          },
        };
      }
      return { success: true, data: { id: 1, restaurantId: 2, role: "ADMIN" } };
    },
  };
  const api: any = {
    send: async (...args: any[]) => state.sent.push(args),
    delete: async () => {
      state.deleted = true;
    },
    answer: async () => {},
  };
  return {
    engine: new Engine(store, bus, api, cipher),
    state,
    store,
    bus,
    api,
  };
}
const update = (text: string, id = 10) => ({
  message: { message_id: 3, chat: { type: "private", id }, from: { id }, text },
});
const bound = () => ({
  chat_id: "10",
  telegram_user_id: "10",
  user_id: 1,
  restaurant_id: 2,
  encrypted_session: cipher.encrypt("secret", "10"),
  expires_at: new Date("2099-01-01"),
  preferences: { stock: true, status: true, writeoff: true, expiry: true },
  daily_enabled: false,
  daily_time: "09:00",
  blocked: false,
});
test("login deletes password before RPC, encrypts only returned session and rejects group input", async () => {
  const { engine, state } = setup();
  await engine.handle({
    message: {
      chat: { type: "group", id: 10 },
      from: { id: 10 },
      text: "/login",
    },
  });
  assert.equal(state.sent.length, 0);
  await engine.handle(update("/login"));
  await engine.handle(update("boss@example.com"));
  await engine.handle(update("password"));
  assert.equal(state.binding.restaurant_id, 2);
  assert.equal(state.binding.encrypted_session.includes("secret"), false);
  assert.equal(cipher.decrypt(state.binding.encrypted_session, "10"), "secret");
  assert.equal(state.calls[0][0], "command.auth.telegram_login");
});
test("summary revalidates current session and tenant before queueing; transient outage preserves binding", async () => {
  const { engine, state, bus } = setup();
  state.binding = bound();
  await engine.handle(update("/summary"));
  assert.equal(state.calls[0][0], "command.auth.telegram_verify");
  assert.equal(state.intents.length, 1);
  bus.sendCommand = async () => {
    throw new Error("timeout");
  };
  await engine.handle(update("/summary"));
  assert.equal(state.intents.length, 1);
  assert.equal(state.removed, false);
  bus.sendCommand = async () => ({
    success: true,
    data: { id: 1, restaurantId: 999, role: "ADMIN" },
  });
  await engine.handle(update("/summary"));
  assert.equal(state.removed, true);
});
test("logout revokes separate session and clears pending data; cancel erases password conversation", async () => {
  const { engine, state } = setup();
  state.binding = bound();
  await engine.handle(update("/logout"));
  assert.equal(state.calls[0][0], "command.auth.telegram_logout");
  assert.equal(state.removed, true);
  await engine.handle(update("/login"));
  await engine.handle(update("boss@example.com"));
  await engine.handle(update("/cancel"));
  await engine.handle(update("password"));
  assert.equal(state.calls.length, 1);
});
test("delivery rejects disabled preference, changed role and foreign tenant before business queries", async () => {
  const { engine, state, bus } = setup();
  state.binding = bound();
  state.binding.preferences.stock = false;
  assert.equal(
    await engine.render({
      chat_id: "10",
      restaurant_id: 2,
      kind: "stock",
      payload: {},
      attempts: 0,
    } as any),
    null,
  );
  assert.equal(state.calls.length, 0);
  state.binding.preferences.stock = true;
  bus.sendCommand = async () => ({
    success: true,
    data: { id: 1, restaurantId: 2, role: "WAITER" },
  });
  await assert.rejects(
    engine.render({
      chat_id: "10",
      restaurant_id: 2,
      kind: "stock",
      payload: {},
      attempts: 0,
    } as any),
    RpcFailure,
  );
});
test("login failures are bounded per private sender", async () => {
  const { engine, state, bus } = setup();
  bus.sendCommand = async () => {
    state.calls.push(1);
    return { success: false, error: { status: 401 } };
  };
  for (let n = 0; n < 7; n++) {
    await engine.handle(update("/login"));
    await engine.handle(update("a@b.co"));
    await engine.handle(update("password"));
  }
  assert.equal(state.calls.length, 5);
});

test("summary respects real inventory array contracts and preserves unknown financials", async () => {
  const { engine, state, bus } = setup();
  state.binding = bound();
  bus.sendCommand = async (_e: string, key: string) => {
    if (key.endsWith("telegram_verify"))
      return { success: true, data: { id: 1, restaurantId: 2, role: "ADMIN" } };
    if (key.endsWith("get_daily_statistics"))
      return {
        success: true,
        data: {
          revenue: null,
          earning: null,
          orders: 5,
          completed: 4,
          averageCheck: null,
        },
      };
    if (key.endsWith("get_dish_statistics"))
      return { success: true, data: { active: 2, lowStock: 1, stopList: 0 } };
    if (key === "command.inventory.get_statistics")
      return {
        success: true,
        data: {
          totalProducts: 4,
          lowStockProducts: [{ product: { name: "Egg" } }],
        },
      };
    if (key.endsWith("get_expiring_inventory"))
      return { success: true, data: [{ id: 1 }] };
    if (key.endsWith("get_write_offs"))
      return { success: true, data: [{ batchId: 1, reason: "EXPIRED" }] };
  };
  const rendered = await engine.render({
    chat_id: "10",
    restaurant_id: 2,
    kind: "summary",
    payload: { date: "2026-10-15" },
    attempts: 0,
  } as any);
  assert.match(rendered!, /Egg/);
  assert.match(rendered!, /Выручка: нет данных/);
  assert.match(rendered!, /заканчиваются: 1/);
  assert.match(rendered!, /ожидает утилизации: 1/);
});
test("logout blocks pending delivery immediately when revocation service is unavailable", async () => {
  const { engine, state, store, bus } = setup();
  state.binding = bound();
  store.block = async () => {
    state.binding.blocked = true;
  };
  bus.sendCommand = async () => {
    throw Error("timeout");
  };
  await engine.handle(update("/logout"));
  assert.equal(state.binding.blocked, true);
  assert.equal(state.removed, false);
});

test("blocked binding revocation retries independently without delivering business data", async () => {
  const { engine, state, store, bus } = setup();
  state.binding = bound();
  state.binding.blocked = true;
  store.blockedBindings = async () => [state.binding];
  bus.sendCommand = async () => {
    throw Error("unavailable");
  };
  await engine.finishBlocked();
  assert.equal(state.removed, false);
  bus.sendCommand = async (_e: string, key: string) => {
    assert.equal(key, "command.auth.telegram_logout");
    return { success: true, data: { ok: true } };
  };
  await engine.finishBlocked();
  assert.equal(state.removed, true);
});

test("status output stays below Telegram limit with hostile escaped names", async () => {
  const { engine, state } = setup();
  state.binding = bound();
  const text = await engine.render({
    chat_id: "10",
    restaurant_id: 2,
    kind: "status",
    payload: {
      changes: Array.from({ length: 50 }, (_, dishId) => ({
        dishId,
        dishName: "&".repeat(200),
        status: "LOW_STOCK",
      })),
    },
    attempts: 0,
  } as any);
  assert.ok(text!.length < 3900);
});
