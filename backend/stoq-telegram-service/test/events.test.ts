import { test } from "node:test";
import assert from "node:assert/strict";
import { eventInput } from "../src/events";
test("events require matching numeric trusted tenant header and stable source identity", () => {
  const payload = {
    restaurantId: 2,
    eventId: "id-1",
    reason: "SUPPLY_CREATED",
  };
  assert.equal(
    eventInput("stock", payload, {
      properties: { headers: { restaurantId: 3 } },
    }),
    null,
  );
  assert.equal(
    eventInput("stock", payload, {
      properties: { headers: { restaurantId: "2" } },
    }),
    null,
  );
  assert.equal(
    eventInput(
      "stock",
      { ...payload, eventId: undefined },
      { properties: { headers: { restaurantId: 2 } } },
    ),
    null,
  );
  assert.equal(
    eventInput("stock", payload, {
      properties: { headers: { restaurantId: 2 } },
    })?.kind,
    "stock",
  );
  assert.equal(
    eventInput(
      "stock",
      { ...payload, reason: "MANUAL_UPDATE" },
      { properties: { headers: { restaurantId: 2 } } },
    )?.kind,
    "writeoff",
  );
  assert.equal(
    eventInput(
      "stock",
      { ...payload, reason: "EXPIRATION_WRITE_OFF" },
      { properties: { headers: { restaurantId: 2 } } },
    ),
    null,
  );
});
test("status snapshots validate complete bounded identities before replacing baseline", () => {
  const message = { properties: { headers: { restaurantId: 2 } } };
  assert.equal(
    eventInput(
      "status",
      { restaurantId: 2, statuses: [{ dishId: 1, status: "UNKNOWN" }] },
      message,
    ),
    null,
  );
  const input = eventInput(
    "status",
    {
      restaurantId: 2,
      statuses: [{ dishId: 1, status: "LOW_STOCK", dishName: "Soup" }],
    },
    message,
  );
  assert.equal(input?.statuses?.[0].dishId, 1);
  assert.ok(input?.source);
});
