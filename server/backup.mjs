import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { query } from './db.mjs';
import { fileURLToPath } from 'node:url';

function getBackupDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'BazaarKolchiBelMa3qoul', 'Backups');
}

async function ensureBackupDir() {
  const dir = getBackupDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function databaseConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL غير مضبوط.');
  const u = new URL(raw);
  return {
    host: u.hostname || 'localhost',
    port: u.port || '5432',
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: decodeURIComponent((u.pathname || '').replace(/^\//, '')),
  };
}

function candidateBinDirs() {
  const out = [];
  if (process.env.PG_BIN_DIR) out.push(process.env.PG_BIN_DIR);
  if (process.env.PGROOT) out.push(path.join(process.env.PGROOT, 'bin'));
  if (process.platform === 'win32') {
    for (const v of ['18', '17', '16', '15', '14']) {
      out.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL', v, 'bin'));
    }
  }
  out.push('');
  return [...new Set(out)];
}

function findBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  for (const dir of candidateBinDirs()) {
    const candidate = dir ? path.join(dir, exe) : exe;
    if (!dir || fsSync.existsSync(candidate)) return candidate;
  }
  throw new Error(`${name} غير موجود. تأكد من تثبيت PostgreSQL 18 أو اضبط PG_BIN_DIR.`);
}

function runBinary(binary, args, envExtra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      env: { ...process.env, ...envExtra },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error((stderr || stdout || `exit code ${code}`).trim()));
    });
  });
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function safeFilename(filename) {
  return typeof filename === 'string' && path.basename(filename) === filename && /^[\w.-]+\.dump$/i.test(filename);
}

export async function getBackupInfo() {
  const directory = await ensureBackupDir();
  const names = (await fs.readdir(directory)).filter((name) => /\.dump$/i.test(name));
  const files = [];
  for (const name of names) {
    try {
      const stat = await fs.stat(path.join(directory, name));
      files.push({ name, size: stat.size, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() });
    } catch {}
  }
  files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  return { directory, files };
}

export async function createBackup() {
  const directory = await ensureBackupDir();
  const cfg = databaseConfig();
  const file = path.join(directory, `Backup_${timestamp()}.dump`);
  const binary = findBinary('pg_dump');
  await runBinary(binary, [
    '--format=custom',
    '--no-owner',
    '--file', file,
    '--host', cfg.host,
    '--port', cfg.port,
    '--username', cfg.user,
    '--dbname', cfg.database
  ], { PGPASSWORD: cfg.password });
  const stat = await fs.stat(file);
  return { name: path.basename(file), path: file, size: stat.size, createdAt: stat.birthtime.toISOString(), directory };
}

export async function restoreBackup(filename) {
  if (!safeFilename(filename)) throw Object.assign(new Error('اسم النسخة الاحتياطية غير صالح.'), { statusCode: 400 });
  const directory = await ensureBackupDir();
  const file = path.join(directory, filename);
  try { await fs.access(file); } catch { throw Object.assign(new Error('ملف النسخة الاحتياطية غير موجود.'), { statusCode: 404 }); }

  const open = await query("SELECT id FROM cash_sessions WHERE status='open' LIMIT 1");
  if (open.rows.length) {
    throw Object.assign(new Error('لا يمكن استعادة النسخة أثناء وجود صندوق مفتوح. أغلق جلسة الصندوق أولًا.'), { statusCode: 409 });
  }

  const cfg = databaseConfig();

  // The API itself keeps a PostgreSQL pool open. Terminate other sessions
  // before pg_restore so --clean can drop/recreate objects reliably.
  await query(
    `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()`,
    [cfg.database]
  );

  const binary = findBinary('pg_restore');
  await runBinary(binary, [
    '--exit-on-error',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--host', cfg.host,
    '--port', cfg.port,
    '--username', cfg.user,
    '--dbname', cfg.database,
    file
  ], { PGPASSWORD: cfg.password });

  return { ok: true, name: filename, directory };
}


const scheduleFileName = 'backup-schedule.json';
const DEFAULT_SCHEDULE = { enabled: false, frequency: 'daily', times: ['02:00'], lastRuns: {} };
let schedulerTimer = null;
let backupInProgress = false;

async function scheduleFilePath() {
  return path.join(await ensureBackupDir(), scheduleFileName);
}

function normalizeTimes(times) {
  const list = Array.isArray(times) ? times : [];
  return [...new Set(list.map(v => String(v || '').trim()).filter(v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)))].sort();
}

export async function getBackupSchedule() {
  const file = await scheduleFilePath();
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    return { ...DEFAULT_SCHEDULE, ...raw, times: normalizeTimes(raw.times) };
  } catch {
    return { ...DEFAULT_SCHEDULE, times: [...DEFAULT_SCHEDULE.times], lastRuns: {} };
  }
}

export async function saveBackupSchedule(input = {}) {
  const current = await getBackupSchedule();
  const schedule = {
    enabled: Boolean(input.enabled),
    frequency: ['daily', 'weekly', 'monthly'].includes(input.frequency) ? input.frequency : 'daily',
    times: normalizeTimes(input.times).length ? normalizeTimes(input.times) : ['02:00'],
    lastRuns: current.lastRuns || {}
  };
  await fs.writeFile(await scheduleFilePath(), JSON.stringify(schedule, null, 2), 'utf8');
  return schedule;
}

function scheduleKey(now, time) {
  const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return `${day}_${time}`;
}

function scheduleMatches(now, frequency) {
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') return now.getDay() === 1;
  if (frequency === 'monthly') return now.getDate() === 1;
  return false;
}

export function startBackupScheduler() {
  if (schedulerTimer) return;
  const tick = async () => {
    if (backupInProgress) return;
    try {
      const schedule = await getBackupSchedule();
      if (!schedule.enabled || !schedule.times?.length) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      if (!schedule.times.includes(hhmm) || !scheduleMatches(now, schedule.frequency)) return;
      const key = scheduleKey(now, hhmm);
      if (schedule.lastRuns?.[key]) return;
      backupInProgress = true;
      await createBackup();
      const latest = await getBackupSchedule();
      latest.lastRuns = { ...(latest.lastRuns || {}), [key]: new Date().toISOString() };
      const keys = Object.keys(latest.lastRuns).sort().slice(-200);
      latest.lastRuns = Object.fromEntries(keys.map(k => [k, latest.lastRuns[k]]));
      await fs.writeFile(await scheduleFilePath(), JSON.stringify(latest, null, 2), 'utf8');
    } catch (error) {
      console.error('Automatic backup failed:', error?.message || error);
    } finally {
      backupInProgress = false;
    }
  };
  schedulerTimer = setInterval(tick, 20000);
  tick();
}

export function stopBackupScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
