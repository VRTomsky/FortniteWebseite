// Zugriff auf fortnite-api.com (CORS offen) und die eigenen JSON-Dateien der Seite.
const BASE = 'https://fortnite-api.com';
const LANG = 'language=de';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function get(path, { key, timeout = 25000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(BASE + path, { headers: key ? { Authorization: key } : {}, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'Die Fortnite-API antwortet gerade nicht (Zeitüberschreitung).' : 'Keine Verbindung zur Fortnite-API. Prüf deine Internetverbindung.', 0);
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try { body = await res.json(); } catch { /* kein JSON */ }
  const status = body?.status ?? res.status;
  if (!res.ok || status !== 200) throw new ApiError(body?.error || `Fehler ${res.status}`, status);
  return body.data;
}

const q = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const api = {
  shop: () => get(`/v2/shop?${LANG}&responseFlags=4`),
  newCosmetics: () => get(`/v2/cosmetics/new?${LANG}&responseFlags=4`),
  cosmetic: (id) => get(`/v2/cosmetics/br/${encodeURIComponent(id)}?${LANG}&responseFlags=4`),
  search: (params) => get(`/v2/cosmetics/br/search/all?${q({ ...params, matchMethod: 'contains', searchLanguage: 'de' })}&${LANG}&responseFlags=4`),
  news: () => get(`/v2/news/br?${LANG}`),
  map: () => get(`/v1/map?${LANG}`),
  stats: ({ name, accountType = 'epic', timeWindow = 'lifetime', key }) =>
    get(`/v2/stats/br/v2?${q({ name, accountType, timeWindow })}`, { key, timeout: 20000 }),
};

/**
 * Wird die Seite direkt aus dem Branch veröffentlicht (Pages-Quelle „Deploy from a branch“), fehlt der
 * Ordner data/. Der Workflow legt die Dateien dann im Branch „data“ ab – von dort per raw.githubusercontent.com.
 */
const RAW_DATA = (() => {
  const owner = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname)?.[1];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return owner && repo ? `https://raw.githubusercontent.com/${owner}/${repo}/data/` : null;
})();

async function getJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Eigene Dateien (vom GitHub-Workflow erzeugt bzw. im Repo). null, wenn nicht vorhanden. */
export async function local(path) {
  const own = await getJson(path, { cache: 'no-cache' });
  if (own || !RAW_DATA || !path.startsWith('data/')) return own;
  return getJson(RAW_DATA + path.slice(5));
}
