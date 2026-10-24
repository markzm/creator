import type { DocV6 } from './schema/types';

/**
 * Checks entity field data for logical contradictions or worldbuilding inconsistencies.
 * Matches legacy `CC.checkConsistency` in legacy/index.html L1250-L1280.
 */
export function checkConsistency(
  data: Record<string, string>,
  mode: 'world' | 'org' | 'char' | 'w' | 'o' | 'c',
  doc?: DocV6
): string[] {
  const issues: string[] = [];
  const g = (id: string) => (data[id] || '').trim();

  const gender = g('gender');
  const pers = g('personality');
  if (/男/.test(gender) && /她/.test(pers)) {
    issues.push('性别「男」但性格用了「她」，可能笔误。');
  }
  if (/女/.test(gender) && /他(?!人)/.test(pers)) {
    issues.push('性别「女」但性格用了「他」，可能笔误。');
  }

  const pw = g('power');
  const wk = g('weakness');
  if (pw && wk && pw.includes('火') && wk.includes('火')) {
    issues.push('能力是火，弱点又怕火——确认是否矛盾。');
  }

  const pri = g('principle');
  const job = g('job');
  if (pri.includes('绝不杀') && /杀手|刺客/.test(job)) {
    issues.push('原则「绝不杀」但职业是杀手——请确认。');
  }

  const age = g('age');
  const gr = g('growth');
  if (age && gr) {
    const anMatch = age.match(/\d+/);
    const an = anMatch ? parseInt(anMatch[0], 10) : NaN;
    const ym = gr.match(/(\d+)\s*年前/);
    if (an && ym && parseInt(ym[1], 10) > an) {
      issues.push(`年龄约 ${an} 岁但经历提到「${ym[1]} 年前」——请检查时间线。`);
    }
  }

  if ((mode === 'char' || mode === 'c') && doc) {
    const charWorld = g('world');
    const charRace = g('race');
    if (charWorld) {
      const w = Object.values(doc.worlds || {}).find(
        (x) => x.data && (x.data.w_name === charWorld || x.name === charWorld)
      );
      if (w && w.data) {
        const races = (w.data.w_races || '')
          .split(/[、,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (charRace && races.length && !races.some((r) => charRace.includes(r))) {
          issues.push(
            `角色种族「${charRace}」不在世界观「${charWorld}」的种族表中——请确认是有意例外。`
          );
        }
      }
    }
  }

  return issues;
}
