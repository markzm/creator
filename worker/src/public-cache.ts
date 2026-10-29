// Only public aggregates belong here. Authentication and private documents are never cached.
const caches = new WeakMap<D1Database, Map<string, { expires: number; value: Promise<unknown> }>>();
export function invalidatePublic(db: D1Database) { caches.delete(db); }
export async function publicCached<T>(db: D1Database, key: string, load: () => Promise<T>): Promise<T> {
  let cache = caches.get(db);
  if (!cache) { cache = new Map(); caches.set(db, cache); }
  const old = cache.get(key);
  if (old && old.expires > Date.now()) return old.value as Promise<T>;
  if (cache.size >= 80) cache.delete(cache.keys().next().value!);
  const entry = { expires: Date.now() + 30_000, value: load() };
  cache.set(key, entry);
  try { return await entry.value; }
  catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}
export function boundedInt(value: string | undefined, fallback: number, max: number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}
export function escapeLike(value: string) { return value.replace(/[\\%_]/g, '\\$&'); }
