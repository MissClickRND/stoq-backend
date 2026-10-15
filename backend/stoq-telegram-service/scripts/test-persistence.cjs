const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { randomUUID } = require("node:crypto");
const { Store } = require("../dist/src/store");
(async () => {
  const url = process.env.CI_DATABASE_URL || process.env.DATABASE_URL;
  if (
    !url ||
    !/^ci_[a-zA-Z0-9_]+$/.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    )
  )
    throw Error("Persistence tests require a dedicated ci_ database");
  const connection = { connectionString: url, connectionTimeoutMillis: 5000 };
  let pool = new Pool(connection),
    store = new Store(pool);
  const chat = String(8000000000000 + Math.floor(Math.random() * 100000000)),
    tenant = 1900000000 + Math.floor(Math.random() * 1000000),
    source = randomUUID();
  try {
    await store.saveBinding({
      chat_id: chat,
      telegram_user_id: chat,
      user_id: 1,
      restaurant_id: tenant,
      encrypted_session: "encrypted-test-placeholder",
      expires_at: new Date("2099-01-01"),
      preferences: { stock: true },
      daily_enabled: false,
      daily_time: "09:00",
      blocked: false,
    });
    await store.preference(chat, "stock");
    await store.daily(chat, true, "09:15");
    await store.advance(127);
    await store.enqueue(chat, tenant, "summary", "test:" + source, {
      date: "2026-10-15",
    });
    await pool.end();
    pool = new Pool(connection);
    store = new Store(pool);
    const restored = await store.binding(chat);
    assert.equal(restored.preferences.stock, false);
    assert.equal(restored.daily_enabled, true);
    assert.equal(restored.daily_time, "09:15");
    assert.ok((await store.offset()) >= 127);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::integer n FROM telegram_outbox WHERE chat_id=$1",
          [chat],
        )
      ).rows[0].n,
      1,
    );
    await store.preference(chat, "stock");
    const event = { tenant, kind: "stock", source: "test:" + source };
    await store.recordEvent(event);
    await store.recordEvent(event);
    await store.recordEvent({ ...event, source: "test:other:" + source });
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::integer n FROM telegram_outbox WHERE chat_id=$1 AND kind='stock'",
          [chat],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::integer n FROM telegram_event_receipts WHERE restaurant_id=$1",
          [tenant],
        )
      ).rows[0].n,
      2,
    );
    await store.recordEvent({
      tenant,
      kind: "status",
      source: "baseline:" + source,
      statuses: [
        { dishId: 1, status: "AVAILABLE" },
        { dishId: 2, status: "AVAILABLE" },
      ],
    });
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::integer n FROM telegram_outbox WHERE chat_id=$1 AND kind='status'",
          [chat],
        )
      ).rows[0].n,
      0,
    );
    const now = new Date("2026-10-16T06:30:05Z");
    await store.recordEvent(
      {
        tenant,
        kind: "status",
        source: "low:" + source,
        statuses: [
          { dishId: 1, status: "LOW_STOCK" },
          { dishId: 2, status: "AVAILABLE" },
        ],
      },
      now,
    );
    await store.recordEvent(
      {
        tenant,
        kind: "status",
        source: "stop:" + source,
        statuses: [
          { dishId: 1, status: "STOP_LIST" },
          { dishId: 2, status: "LOW_STOCK" },
        ],
      },
      now,
    );
    const changes = (
      await pool.query(
        "SELECT payload FROM telegram_outbox WHERE chat_id=$1 AND kind='status'",
        [chat],
      )
    ).rows[0].payload.changes;
    assert.equal(changes.length, 2);
    assert.equal(changes.find((x) => x.dishId === 1).status, "STOP_LIST");
    await store.schedule(now);
    await store.schedule(now);
    const daily = (
      await pool.query(
        "SELECT payload FROM telegram_outbox WHERE chat_id=$1 AND kind='daily'",
        [chat],
      )
    ).rows;
    assert.equal(daily.length, 1);
    assert.equal(daily[0].payload.date, "2026-10-15");
    await assert.rejects(
      store.transaction(async (db) => {
        await db.query(
          "INSERT INTO telegram_event_receipts(restaurant_id,source_key) VALUES($1,$2)",
          [tenant, "rollback:" + source],
        );
        throw Error("rollback");
      }),
    );
    assert.equal(
      (
        await pool.query(
          "SELECT 1 FROM telegram_event_receipts WHERE restaurant_id=$1 AND source_key=$2",
          [tenant, "rollback:" + source],
        )
      ).rowCount,
      0,
    );
    await store.block(chat);
    assert.equal((await store.binding(chat)).blocked, true);
    assert.equal(
      (
        await pool.query(
          "SELECT 1 FROM telegram_outbox WHERE chat_id=$1 AND state='pending'",
          [chat],
        )
      ).rowCount,
      0,
    );
    await store.remove(chat);
    assert.equal(await store.binding(chat), null);
    assert.equal(
      (
        await pool.query("SELECT 1 FROM telegram_outbox WHERE chat_id=$1", [
          chat,
        ])
      ).rowCount,
      0,
    );
    console.log(
      "Telegram PostgreSQL persistence checks passed: reconnect, preferences, cursor, outbox, dedupe, coalescing, baseline, daily uniqueness, rollback, block/logout cleanup",
    );
  } finally {
    await pool.query("DELETE FROM telegram_bindings WHERE chat_id=$1", [chat]);
    await pool.query(
      "DELETE FROM telegram_event_receipts WHERE restaurant_id=$1",
      [tenant],
    );
    await pool.query(
      "DELETE FROM telegram_status_baselines WHERE restaurant_id=$1",
      [tenant],
    );
    await pool.end();
  }
})().catch((error) => {
  console.error(
    "Telegram persistence checks failed:",
    error.code || error.name,
  );
  process.exitCode = 1;
});
