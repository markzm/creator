import { INSP, PERSONA_MAP } from './legacy/insp';

/**
 * Generates random persona fields for any empty persona keys in `currentData`.
 * Matches legacy `CC.autoPersona` in legacy/index.html L2765-L2792.
 */
export function generateRandomPersona(
  currentData: Record<string, string> = {},
  randFn: () => number = Math.random
): { data: Record<string, string>; filledCount: number; filledKeys: string[] } {
  const next: Record<string, string> = { ...currentData };
  const filledKeys: string[] = [];

  Object.keys(PERSONA_MAP).forEach((fid) => {
    if ((next[fid] || '').trim()) return;
    const pool = INSP[PERSONA_MAP[fid]];
    if (!pool || !pool.length) return;
    const idx = Math.floor(randFn() * pool.length);
    next[fid] = pool[idx];
    filledKeys.push(fid);
  });

  return {
    data: next,
    filledCount: filledKeys.length,
    filledKeys
  };
}
