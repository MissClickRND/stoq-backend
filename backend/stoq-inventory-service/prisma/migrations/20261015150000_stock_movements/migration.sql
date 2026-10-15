-- These models were already used by inventory-service but absent from migrations.
CREATE TABLE IF NOT EXISTS inventory.stock_movements (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  batch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity DECIMAL NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory.idempotency_keys (
  key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS batches_status_expires_at_idx ON inventory.batches(status, expires_at);
