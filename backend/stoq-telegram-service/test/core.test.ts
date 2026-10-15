import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SessionCipher,
  privateMessage,
  moscowDay,
  scheduledDate,
  retryDecision,
  statusChanges,
  safeText,
} from "../src/core";

test("private chat requires matching sender and chat; rejects groups and callbacks from other senders", () => {
  assert.equal(
    privateMessage({
      message: {
        chat: { id: 10, type: "private" },
        from: { id: 11 },
        text: "/start",
      },
    }),
    null,
  );
  assert.equal(
    privateMessage({
      message: { chat: { id: 10, type: "group" }, from: { id: 10 } },
    }),
    null,
  );
  assert.equal(
    privateMessage({
      callback_query: {
        id: "x",
        from: { id: 11 },
        data: "summary",
        message: { chat: { id: 10, type: "private" } },
      },
    }),
    null,
  );
  assert.equal(
    privateMessage({
      message: {
        message_id: 1,
        chat: { id: 10, type: "private" },
        from: { id: 10 },
        text: "/start",
      },
    })?.userId,
    "10",
  );
});
test("AES GCM hides the token and binds ciphertext to Telegram identity", () => {
  const cipher = new SessionCipher(Buffer.alloc(32, 7).toString("base64"));
  const secret = cipher.encrypt("opaque-secret", "10");
  assert.equal(secret.includes("opaque-secret"), false);
  assert.equal(cipher.decrypt(secret, "10"), "opaque-secret");
  assert.throws(() => cipher.decrypt(secret, "11"));
  assert.throws(() => new SessionCipher("bad-key"));
});
test("Moscow schedule uses previous complete date and never sends before selected time", () => {
  const now = new Date("2026-10-15T21:30:00Z");
  assert.equal(moscowDay(now), "2026-10-16");
  assert.equal(scheduledDate(now, "09:00"), null);
  assert.equal(
    scheduledDate(new Date("2026-10-16T06:00:00Z"), "09:00"),
    "2026-10-15",
  );
  assert.equal(scheduledDate(now, "25:00"), null);
});
test("Telegram retry honors 429 retry_after and distinguishes blocked and transient failures", () => {
  assert.deepEqual(retryDecision(429, { parameters: { retry_after: 37 } }, 1), {
    retryMs: 37000,
    blocked: false,
  });
  assert.equal(retryDecision(503, {}, 2).retryMs, 4000);
  assert.equal(retryDecision(403, {}, 0).blocked, true);
  assert.equal(retryDecision(400, {}, 0).retryMs, null);
});
test("stop snapshots start silently and emit only state transitions including recovery", () => {
  const current = [{ dishId: 1, name: "Soup", status: "STOP_LIST" }];
  assert.deepEqual(statusChanges(null, current), []);
  assert.deepEqual(statusChanges(current, current), []);
  assert.equal(
    statusChanges(current, [
      { dishId: 1, name: "Soup", status: "AVAILABLE" },
    ])[0].status,
    "AVAILABLE",
  );
});
test("output is escaped and bounded", () => {
  assert.equal(safeText("<script>&"), "&lt;script&gt;&amp;");
  assert.ok(safeText("a".repeat(5000)).length <= 3500);
});
