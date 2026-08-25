import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('[db:check] DATABASE_URL is missing.');
  console.error('[db:check] Create a .env file from .env.example and set DATABASE_URL.');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rows } = await client.query('SELECT current_database() AS database, current_user AS user, now() AS server_time');
  console.log('[db:check] PostgreSQL connection OK');
  console.log(JSON.stringify(rows[0], null, 2));
} catch (error) {
  console.error('[db:check] PostgreSQL connection FAILED');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
