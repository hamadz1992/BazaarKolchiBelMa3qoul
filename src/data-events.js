export const DATA_DOMAINS = Object.freeze({
  SALES: 'sales',
  CASH: 'cash',
  INVENTORY: 'inventory',
  CUSTOMERS: 'customers',
  EXPENSES: 'expenses',
  PRODUCTS: 'products',
  REPORTS: 'reports'
});

const CHANNEL = 'bazaar-data-changed';

function normalizeDomains(domains) {
  const list = Array.isArray(domains) ? domains : [domains];
  return [...new Set(list.filter(Boolean).map(String))];
}

export function emitDataChanged(domains, meta = {}) {
  const payload = { domains: normalizeDomains(domains), at: Date.now(), ...meta };
  try { window.dispatchEvent(new CustomEvent('bazaar:data-changed', { detail: payload })); } catch {}
  try { window.desktopAPI?.notifyDataChanged?.(payload.domains, payload); } catch {}
  try {
    window.__bazaarDataChannel ??= ('BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null);
    window.__bazaarDataChannel?.postMessage(payload);
  } catch {}
  return payload;
}

export function subscribeDataChanged(callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (event) => callback(event?.detail || event?.data || {});
  window.addEventListener('bazaar:data-changed', handler);
  const removeDesktop = window.desktopAPI?.onDataChanged?.(handler) || (() => {});
  let channel = null;
  try {
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = handler;
    }
  } catch {}
  return () => {
    window.removeEventListener('bazaar:data-changed', handler);
    try { removeDesktop?.(); } catch {}
    try { channel?.close(); } catch {}
  };
}

export function affectsDomains(event, domains) {
  const changed = new Set(normalizeDomains(event?.domains));
  return normalizeDomains(domains).some((domain) => changed.has(domain));
}
