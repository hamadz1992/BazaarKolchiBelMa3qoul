const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function allowedCorsOrigin(requestOrigin) {
  if (requestOrigin === 'null') return 'null';
  if (requestOrigin === 'https://appassets.androidplatform.net') return requestOrigin;
  if (!requestOrigin) return null;
  const configured = String(process.env.CORS_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_CORS_ORIGINS;
  if (process.env.NODE_ENV === 'production' && !configured.length) throw new Error('CORS_ORIGIN يجب تحديده في production ولا يمكن استخدام قيمة wildcard.');
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const requestOrigin = res.req?.headers?.origin || '';
  const corsOrigin = allowedCorsOrigin(requestOrigin);
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.end(body);
}

export function sendError(res, status, message, details) {
  sendJson(res, status, { ok: false, error: message, ...(details ? { details } : {}) });
}

export async function readJson(req, maxBytes = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('حجم الطلب كبير جدًا.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('JSON غير صالح.'), { statusCode: 400 });
  }
}

export function routeMatch(pathname, pattern) {
  const a = pathname.split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < b.length; i += 1) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
