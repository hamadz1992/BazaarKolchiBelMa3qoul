import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const password = String(process.env.ADMIN_PASSWORD || '');

if (!password) throw new Error('ADMIN_PASSWORD غير موجود في .env');
if (!/^\d{6}$/.test(password)) throw new Error('ADMIN_PASSWORD يجب أن تتكون من 6 أرقام فقط.');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL غير موجود في .env');

const pool = new Pool({ connectionString: databaseUrl });

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(value, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

try {
  const result = await pool.query(`SELECT id FROM users WHERE username=$1 LIMIT 1`, ['admin']);
  if (!result.rows[0]) throw new Error('حساب admin غير موجود في قاعدة البيانات.');
  const id = result.rows[0].id;
  const hash = hashPassword(password);
  await pool.query('BEGIN');
  try {
    await pool.query(`UPDATE users SET password_hash=$1, active=true, password_changed_at=now(), updated_at=now() WHERE id=$2`, [hash, id]);
    await pool.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [id]);
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  console.log('ADMIN_PASSWORD تمت مزامنتها مع حساب admin بنجاح.');
  console.log('Username: admin');
  console.log('لا يتم طباعة كلمة المرور.');
} finally {
  await pool.end();
}
