/** Caché corta en sessionStorage para listas de módulos (clientes, pólizas, agentes). */

const PREFIX = 'gsea_mod_';
const TTL_MS = 5 * 60 * 1000;

export function readModuleCache(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - (parsed.at || 0) > TTL_MS) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeModuleCache(key, data) {
  try {
    sessionStorage.setItem(
      PREFIX + key,
      JSON.stringify({ at: Date.now(), data })
    );
  } catch {
    /* quota */
  }
}

export function clearModuleCache(key) {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
