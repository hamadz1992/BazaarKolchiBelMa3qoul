import crypto from 'node:crypto';
import { query, withTransaction } from './db.mjs';

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;

function normalizeClientIp(value){ return String(value || 'unknown').replace(/^::ffff:/,'').slice(0,64); }

async function enforceLoginLimit(username, clientIp){
  const keyUsername=String(username||'').trim().slice(0,120);
  const ip=normalizeClientIp(clientIp);
  const row=(await query(`SELECT * FROM auth_login_attempts WHERE username=$1 AND client_ip=$2 LIMIT 1`,[keyUsername,ip])).rows[0];
  if(!row) return {username:keyUsername,clientIp:ip};
  const now=Date.now();
  if(row.blocked_until && new Date(row.blocked_until).getTime()>now){ const e=new Error('محاولات تسجيل الدخول كثيرة. حاول بعد قليل.'); e.statusCode=429; throw e; }
  if(now-new Date(row.first_failed_at).getTime()>LOGIN_WINDOW_MS){ await query(`DELETE FROM auth_login_attempts WHERE username=$1 AND client_ip=$2`,[keyUsername,ip]); return {username:keyUsername,clientIp:ip}; }
  return {username:keyUsername,clientIp:ip,failedCount:Number(row.failed_count||0)};
}

async function recordLoginFailure(username,clientIp){
  const now=new Date();
  const current=await enforceLoginLimit(username,clientIp).catch(e=>null);
  const keyUsername=String(username||'').trim().slice(0,120), ip=normalizeClientIp(clientIp);
  if(current?.failedCount===undefined){ await query(`INSERT INTO auth_login_attempts(username,client_ip,failed_count,first_failed_at,blocked_until,updated_at) VALUES($1,$2,1,now(),NULL,now()) ON CONFLICT(username,client_ip) DO UPDATE SET failed_count=1,first_failed_at=now(),blocked_until=NULL,updated_at=now()`,[keyUsername,ip]); return; }
  const next=Number(current.failedCount||0)+1;
  const blocked=next>=LOGIN_MAX_FAILURES ? new Date(now.getTime()+LOGIN_BLOCK_MS) : null;
  await query(`INSERT INTO auth_login_attempts(username,client_ip,failed_count,first_failed_at,blocked_until,updated_at) VALUES($1,$2,$3,now(),$4,now()) ON CONFLICT(username,client_ip) DO UPDATE SET failed_count=$3,blocked_until=$4,updated_at=now()`,[keyUsername,ip,next,blocked]);
}

async function clearLoginFailures(username,clientIp){await query(`DELETE FROM auth_login_attempts WHERE username=$1 AND client_ip=$2`,[String(username||'').trim().slice(0,120),normalizeClientIp(clientIp)]);}

function validateStrongPassword(password, field = 'كلمة المرور') {
  const value = String(password || '');
  if (!/^\d{6}$/.test(value)) {
    const e = new Error(`${field} يجب أن تتكون من 6 أرقام فقط.`);
    e.statusCode = 400;
    throw e;
  }
  return value;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}
function verifyPassword(password, encoded) {
  if (!encoded || !encoded.startsWith('scrypt:')) return false;
  const [, salt, expected] = encoded.split(':');
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual,'hex'), Buffer.from(expected,'hex'));
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

export async function ensureAdmin() {
  validateStrongPassword(ADMIN_PASSWORD, 'ADMIN_PASSWORD');
  const r = await query(`SELECT id FROM users WHERE username='admin' LIMIT 1`);
  let userId=r.rows[0]?.id;
  if (!userId) {
    const created=await query(`INSERT INTO users(name,username,password_hash,active,password_changed_at) VALUES($1,$2,$3,true,now()) RETURNING id`,['مدير المحل','admin',hashPassword(ADMIN_PASSWORD)]);
    userId=created.rows[0].id;
  } else {
    // Keep the existing admin account, but synchronize its password with
    // ADMIN_PASSWORD from the environment. This also repairs databases that
    // were created before the security hardening.
    const current = await query(`SELECT password_hash FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const currentHash = current.rows[0]?.password_hash;
    if (!currentHash || !verifyPassword(ADMIN_PASSWORD, currentHash)) {
      await query(
        `UPDATE users
            SET password_hash=$1,
                password_changed_at=now(),
                updated_at=now()
          WHERE id=$2`,
        [hashPassword(ADMIN_PASSWORD), userId]
      );
      await query(`DELETE FROM auth_sessions WHERE user_id=$1`, [userId]);
    }
    const role=await query(`SELECT r.id FROM roles r WHERE r.name='مدير' LIMIT 1`);
    if(role.rows[0]) await query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[userId,role.rows[0].id]);
  }
  const adminRole=await query(`SELECT id FROM roles WHERE name='مدير' LIMIT 1`);
  if(adminRole.rows[0]) await query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[userId,adminRole.rows[0].id]);
}

export async function login(username,password,clientIp='unknown') {
  await enforceLoginLimit(username,clientIp);
  const r=await query(`SELECT id,name,username,password_hash,active FROM users WHERE username=$1 LIMIT 1`,[String(username||'').trim()]);
  const u=r.rows[0];
  if(!u || !u.active || !verifyPassword(password,u.password_hash)) { await recordLoginFailure(username,clientIp); const e=new Error('اسم المستخدم أو كلمة المرور غير صحيحة.'); e.statusCode=401; throw e; }
  await clearLoginFailures(username,clientIp);
  const token=crypto.randomBytes(32).toString('base64url');
  const expires=new Date(Date.now()+SESSION_DAYS*86400000);
  await query(`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`,[u.id,tokenHash(token),expires]);
  await query(`UPDATE users SET last_login_at=now() WHERE id=$1`,[u.id]);
  return {token,expiresAt:expires.toISOString(),user:{id:u.id,name:u.name,username:u.username}};
}
export async function authenticate(req) {
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer ')) return null;
  const token=h.slice(7).trim(); if(!token) return null;
  const r=await query(`SELECT u.id,u.name,u.username,u.active,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[tokenHash(token)]);
  if(!r.rows[0]) return null;
  await query(`UPDATE auth_sessions SET last_seen_at=now() WHERE id=$1`,[r.rows[0].session_id]);
  return r.rows[0];
}
export async function requireAuth(req) { const u=await authenticate(req); if(!u){const e=new Error('يجب تسجيل الدخول.');e.statusCode=401;throw e;} return u; }
export async function requirePermission(req, code) {
  const u=await requireAuth(req);
  const r=await query(`SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=$1 AND p.code=$2 LIMIT 1`,[u.id,code]);
  if(!r.rowCount){const e=new Error('ليس لديك صلاحية لتنفيذ هذه العملية.');e.statusCode=403;throw e;}
  return u;
}
export async function logout(req){const h=req.headers.authorization||'';if(h.startsWith('Bearer ')) await query(`DELETE FROM auth_sessions WHERE token_hash=$1`,[tokenHash(h.slice(7).trim())]);}
export { hashPassword, validateStrongPassword };
