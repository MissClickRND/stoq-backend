CREATE TABLE IF NOT EXISTS telegram_bindings (
  chat_id text PRIMARY KEY CHECK (chat_id ~ '^[1-9][0-9]{0,19}$'),
  telegram_user_id text NOT NULL CHECK (telegram_user_id = chat_id),
  user_id integer NOT NULL, restaurant_id integer NOT NULL CHECK (restaurant_id > 0),
  encrypted_session text NOT NULL, expires_at timestamptz NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{"stock":true,"writeoff":true,"expiry":true,"status":true}',
  daily_enabled boolean NOT NULL DEFAULT false,
  daily_time text NOT NULL DEFAULT '09:00' CHECK (daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  blocked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_cursor (id integer PRIMARY KEY CHECK(id=1), next_offset bigint NOT NULL DEFAULT 0);
INSERT INTO telegram_cursor(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS telegram_outbox (
 id bigserial PRIMARY KEY, chat_id text NOT NULL REFERENCES telegram_bindings(chat_id) ON DELETE CASCADE,
 restaurant_id integer NOT NULL, kind text NOT NULL CHECK(kind IN ('summary','daily','stock','writeoff','expiry','status')),
 dedupe_key text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', attempts integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(chat_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS telegram_outbox_pending ON telegram_outbox(next_at) WHERE state='pending';
CREATE TABLE IF NOT EXISTS telegram_event_receipts (
 restaurant_id integer NOT NULL, source_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(restaurant_id,source_key)
);
CREATE TABLE IF NOT EXISTS telegram_status_baselines (
 restaurant_id integer PRIMARY KEY, snapshot jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
