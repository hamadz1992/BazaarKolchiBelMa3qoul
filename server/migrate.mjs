import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;
const dir = fileURLToPath(new URL('../database/migrations/', import.meta.url));
const files = (await fs.readdir(dir))
  .filter(name => /^\d+_.*\.sql$/.test(name))
  .sort();

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(40) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const name of files) {
    const version = name.split('_', 1)[0];
    const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (exists.rowCount) {
      console.log(`Skipping ${name}`);
      continue;
    }
    const sql = await fs.readFile(path.join(dir, name), 'utf8');
    console.log(`Applying ${name}...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('PostgreSQL migrations completed successfully.');
} finally {
  await client.end();
}
