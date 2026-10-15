import { Pool, PoolClient } from "pg";
import { scheduledDate, statusChanges } from "./core";
import { EventInput } from "./events";
export type Kind =
  "stock" | "writeoff" | "expiry" | "status" | "summary" | "daily";
export interface Binding {
  chat_id: string;
  telegram_user_id: string;
  user_id: number;
  restaurant_id: number;
  encrypted_session: string;
  expires_at: Date;
  preferences: Record<string, boolean>;
  daily_enabled: boolean;
  daily_time: string;
  blocked: boolean;
}
export interface Intent {
  id: string;
  chat_id: string;
  restaurant_id: number;
  kind: Kind;
  payload: any;
  attempts: number;
  expires_at: Date;
}
export class Store {
  constructor(public readonly pool: Pool) {}
  async transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async binding(chat: string): Promise<Binding | null> {
    return (
      (
        await this.pool.query(
          "SELECT * FROM telegram_bindings WHERE chat_id=$1",
          [chat],
        )
      ).rows[0] ?? null
    );
  }
  async saveBinding(b: Binding): Promise<void> {
    await this.pool.query(
      `INSERT INTO telegram_bindings(chat_id,telegram_user_id,user_id,restaurant_id,encrypted_session,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(chat_id) DO UPDATE SET user_id=EXCLUDED.user_id,restaurant_id=EXCLUDED.restaurant_id,encrypted_session=EXCLUDED.encrypted_session,expires_at=EXCLUDED.expires_at,blocked=false`,
      [
        b.chat_id,
        b.telegram_user_id,
        b.user_id,
        b.restaurant_id,
        b.encrypted_session,
        b.expires_at,
      ],
    );
  }
  async remove(chat: string): Promise<void> {
    await this.pool.query("DELETE FROM telegram_bindings WHERE chat_id=$1", [
      chat,
    ]);
  }
  async preference(chat: string, key: string): Promise<void> {
    if (!["stock", "writeoff", "expiry", "status"].includes(key))
      throw Error("Invalid preference");
    await this.pool.query(
      `UPDATE telegram_bindings SET preferences=jsonb_set(preferences,ARRAY[$2],to_jsonb(NOT COALESCE((preferences->>$2)::boolean,false))) WHERE chat_id=$1`,
      [chat, key],
    );
  }
  async daily(chat: string, enabled: boolean, time: string): Promise<void> {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error("Invalid time");
    await this.pool.query(
      "UPDATE telegram_bindings SET daily_enabled=$2,daily_time=$3 WHERE chat_id=$1",
      [chat, enabled, time],
    );
  }
  async enqueue(
    chat: string,
    tenant: number,
    kind: Kind,
    key: string,
    payload: any = {},
    db: any = this.pool,
  ): Promise<void> {
    // Coalescing preserves the latest status per dish within a short quiet window.
    await db.query(
      `INSERT INTO telegram_outbox(chat_id,restaurant_id,kind,dedupe_key,payload,next_at) VALUES($1,$2,$3,$4,$5,now()+CASE WHEN $3 IN ('stock','writeoff','status') THEN interval '5 seconds' ELSE interval '0 seconds' END) ON CONFLICT(chat_id,dedupe_key) DO UPDATE SET payload=CASE WHEN telegram_outbox.kind='status' AND telegram_outbox.state='pending' THEN jsonb_build_object('changes',(SELECT COALESCE(jsonb_agg(v),'[]'::jsonb) FROM (SELECT DISTINCT ON (v->>'dishId') v FROM (SELECT value v,1 priority FROM jsonb_array_elements(EXCLUDED.payload->'changes') UNION ALL SELECT value v,0 priority FROM jsonb_array_elements(telegram_outbox.payload->'changes')) d ORDER BY v->>'dishId',priority DESC) merged)) ELSE telegram_outbox.payload END`,
      [chat, tenant, kind, key, JSON.stringify(payload)],
    );
  }
  async offset(): Promise<number> {
    return Number(
      (
        await this.pool.query(
          "SELECT next_offset FROM telegram_cursor WHERE id=1",
        )
      ).rows[0].next_offset,
    );
  }
  async advance(offset: number): Promise<void> {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw Error("Invalid offset");
    await this.pool.query(
      "UPDATE telegram_cursor SET next_offset=GREATEST(next_offset,$1) WHERE id=1",
      [offset],
    );
  }
  async recordEvent(event: EventInput, now = new Date()): Promise<void> {
    await this.transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(3007,$1)", [event.tenant]);
      const receipt = await db.query(
        "INSERT INTO telegram_event_receipts(restaurant_id,source_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING source_key",
        [event.tenant, event.source],
      );
      if (!receipt.rowCount) return;
      let payload: any = {};
      if (event.kind === "status") {
        const previous = (
          await db.query(
            "SELECT snapshot FROM telegram_status_baselines WHERE restaurant_id=$1",
            [event.tenant],
          )
        ).rows[0];
        const changes = statusChanges(
          previous?.snapshot ?? null,
          event.statuses ?? [],
        );
        await db.query(
          "INSERT INTO telegram_status_baselines(restaurant_id,snapshot) VALUES($1,$2) ON CONFLICT(restaurant_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,updated_at=now()",
          [event.tenant, JSON.stringify(event.statuses)],
        );
        if (!changes.length) return;
        payload = { changes };
      }
      const bindings = await db.query(
        "SELECT chat_id FROM telegram_bindings WHERE restaurant_id=$1 AND NOT blocked AND expires_at>now() AND preferences->>$2='true'",
        [event.tenant, event.kind],
      );
      const key =
        event.kind === "expiry"
          ? event.source
          : `${event.kind}:${Math.floor(now.getTime() / 30000)}`;
      for (const b of bindings.rows)
        await this.enqueue(
          b.chat_id,
          event.tenant,
          event.kind,
          key,
          payload,
          db,
        );
    });
  }
  async schedule(now = new Date()): Promise<void> {
    const bindings = await this.pool.query(
      "SELECT * FROM telegram_bindings WHERE daily_enabled AND NOT blocked AND expires_at>now()",
    );
    for (const b of bindings.rows) {
      const date = scheduledDate(now, b.daily_time);
      if (date)
        await this.enqueue(
          b.chat_id,
          b.restaurant_id,
          "daily",
          `daily:${date}`,
          { date },
        );
    }
  }
  async claim(): Promise<Intent | null> {
    return this.transaction(async (db) => {
      await db.query(
        `UPDATE telegram_outbox SET state='cancelled',payload='{}' WHERE state='pending' AND expires_at<now()`,
      );
      const row = (
        await db.query(
          `SELECT * FROM telegram_outbox WHERE state='pending' AND next_at<=now() AND expires_at>now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        )
      ).rows[0];
      if (!row) return null;
      await db.query(
        `UPDATE telegram_outbox SET next_at=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$1`,
        [row.id],
      );
      return row;
    });
  }
  async finish(id: string, state: "sent" | "cancelled") {
    await this.pool.query(
      `UPDATE telegram_outbox SET state=$2,payload='{}' WHERE id=$1`,
      [id, state],
    );
  }
  async retry(id: string, delay: number) {
    await this.pool.query(
      `UPDATE telegram_outbox SET next_at=now()+($2::text||' milliseconds')::interval WHERE id=$1`,
      [id, Math.max(1000, Math.min(86400000, delay))],
    );
  }
  async block(chat: string) {
    await this.transaction(async (db) => {
      await db.query(
        "UPDATE telegram_bindings SET blocked=true,daily_enabled=false WHERE chat_id=$1",
        [chat],
      );
      await db.query(
        `UPDATE telegram_outbox SET state='cancelled',payload='{}' WHERE chat_id=$1 AND state='pending'`,
        [chat],
      );
    });
  }
  async blockedBindings(): Promise<Binding[]> {
    return (
      await this.pool.query(
        "SELECT * FROM telegram_bindings WHERE blocked LIMIT 10",
      )
    ).rows;
  }
  async cleanup() {
    await this.pool.query(
      `DELETE FROM telegram_outbox WHERE state<>'pending' AND created_at<now()-interval '8 days'`,
    );
    await this.pool.query(
      `DELETE FROM telegram_event_receipts WHERE created_at<now()-interval '30 days'`,
    );
    await this.pool.query(
      "DELETE FROM telegram_bindings WHERE expires_at<now()",
    );
  }
}
