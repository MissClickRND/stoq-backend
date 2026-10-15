import { test } from "node:test";
import assert from "node:assert/strict";
import { Delivery } from "../src/delivery";
import { TelegramError } from "../src/bot-api";
function setup() {
  const state: any = { sent: [], finished: [], retries: [], blocked: [] };
  let pending = true;
  const intent: any = {
    id: "1",
    chat_id: "10",
    restaurant_id: 2,
    kind: "stock",
    payload: {},
    attempts: 2,
  };
  const store: any = {
    claim: async () => {
      if (!pending) return null;
      pending = false;
      return intent;
    },
    binding: async () => ({
      chat_id: "10",
      restaurant_id: 2,
      preferences: { stock: true },
      blocked: false,
    }),
    finish: async (...a: any[]) => state.finished.push(a),
    retry: async (...a: any[]) => state.retries.push(a),
    block: async (...a: any[]) => state.blocked.push(a),
  };
  const engine: any = {
    render: async () => "business",
    authorize: async () => {},
  };
  const api: any = { send: async (...a: any[]) => state.sent.push(a) };
  return {
    state,
    store,
    engine,
    api,
    delivery: new Delivery(store, engine, api),
  };
}
test("outbox preserves intent on transient auth outage and honors Telegram retry_after", async () => {
  let x = setup();
  x.engine.render = async () => {
    throw Error("auth down");
  };
  await x.delivery.once();
  assert.equal(x.state.sent.length, 0);
  assert.equal(x.state.finished.length, 0);
  assert.equal(x.state.retries.length, 1);
  x = setup();
  x.api.send = async () => {
    throw new TelegramError(17000);
  };
  await x.delivery.once();
  assert.equal(x.state.retries[0][1], 17000);
});
test("blocked chat stops delivery; preferences are rechecked immediately before sending", async () => {
  let x = setup();
  x.api.send = async () => {
    throw new TelegramError(null, true);
  };
  await x.delivery.once();
  assert.equal(x.state.blocked[0][0], "10");
  x = setup();
  x.store.binding = async () => ({
    chat_id: "10",
    restaurant_id: 2,
    preferences: { stock: false },
  });
  await x.delivery.once();
  assert.equal(x.state.sent.length, 0);
  assert.equal(x.state.finished[0][1], "cancelled");
});
