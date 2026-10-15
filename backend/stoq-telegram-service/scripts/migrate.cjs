const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(3007001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS telegram_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of fs
      .readdirSync(path.join(__dirname, "../migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query(
            "SELECT 1 FROM telegram_migrations WHERE name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await client.query(
        fs.readFileSync(path.join(__dirname, "../migrations", name), "utf8"),
      );
      await client.query("INSERT INTO telegram_migrations(name) VALUES($1)", [
        name,
      ]);
    }
    await client.query("COMMIT");
    console.log("Telegram migrations applied");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(() => {
  console.error("Telegram migration failed");
  process.exitCode = 1;
});
