const path = require('node:path');
const { createRequire } = require('node:module');
const authRequire = createRequire(path.resolve(__dirname, '../backend/stoq-auth-service/package.json'));
const { Client } = authRequire('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT n.nspname AS schema, c.relname AS object, p.privilege
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(privilege)
      WHERE c.relkind IN ('r', 'p') AND n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema'
        AND NOT has_table_privilege(current_user, c.oid, p.privilege)
      UNION ALL
      SELECT n.nspname, c.relname, p.privilege
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(privilege)
      WHERE c.relkind = 'S' AND n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema'
        AND NOT has_sequence_privilege(current_user, c.oid, p.privilege)
      ORDER BY 1, 2, 3
    `);
    if (result.rows.length) {
      console.error('Missing database permissions: ' + result.rows.map(row => `${row.schema}.${row.object}:${row.privilege}`).join(', '));
      process.exitCode = 2;
    } else {
      console.log('Database table and sequence permissions passed');
    }
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
