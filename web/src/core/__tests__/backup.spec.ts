import { describe, expect, it } from 'vitest';
import goldenBackups from '../__fixtures__/golden-backups.json';
import { mergeBackupIntoDoc, normalizeBackup, serializeBackupV6 } from '../backup';
import { createEmptyDocV6, migrateToV6 } from '../schema/migrations';

describe('backup & migrations — Golden Master & DocV6 upgrade', () => {
  const fixedUid = (prefix?: string) => (prefix || '') + 'fixed_uid_123';
  const fixedNow = () => 1700000000000;

  it('passes 100% of golden-backups.json vectors for normalizeBackup', () => {
    expect(goldenBackups.length).toBeGreaterThanOrEqual(5);
    for (const sample of goldenBackups) {
      const actual = normalizeBackup(sample.input, fixedUid, fixedNow);
      expect(actual, `normalizeBackup mismatch on: ${sample.desc}`).toEqual(
        sample.expectedNormalized
      );
    }
  });

  it('upgrades all golden-backups.json vectors cleanly into valid DocV6 via migrateToV6', () => {
    let seq = 1;
    const seqUid = (prefix?: string) => `${prefix || ''}u${seq++}`;

    for (const sample of goldenBackups) {
      const doc = migrateToV6(sample.input, seqUid, 1700000000000);
      expect(doc._version).toBe(6);
      expect(doc.ui).toBeDefined();
      expect(typeof doc.worlds).toBe('object');
      expect(typeof doc.orgs).toBe('object');
      expect(typeof doc.chars).toBe('object');
      expect(Object.keys(doc.templates).length).toBeGreaterThan(0);

      for (const w of Object.values(doc.worlds)) {
        expect(w.id).toBeTruthy();
        expect(typeof w.createdAt).toBe('number');
        expect(typeof w.updatedAt).toBe('number');
        expect(Array.isArray(w.customInsp)).toBe(true);
      }
      for (const c of Object.values(doc.chars)) {
        expect(c.id).toBeTruthy();
        expect(typeof c.createdAt).toBe('number');
        expect(typeof c.updatedAt).toBe('number');
      }
      for (const st of doc.stats) {
        expect(typeof st.date).toBe('string');
        expect(typeof st.chars).toBe('number');
      }
    }
  });

  it('migrates root activeW/activeO/activeC/activeTpl/nowYear from cc_db_v5 into doc.ui', () => {
    const legacyDb = {
      _version: 5.1,
      worlds: { w1: { id: 'w1', name: '艾瑟兰', data: { w_name: '艾瑟兰' } } },
      orgs: { o1: { id: 'o1', name: '暮光议会', data: { o_name: '暮光议会' } } },
      chars: { c1: { id: 'c1', name: '莉莉安', data: { name: '莉莉安' } } },
      activeW: 'w1',
      activeO: 'o1',
      activeC: 'c1',
      activeTpl: 'tp_custom',
      nowYear: '305',
      stats: [{ d: '2026-10-24', n: 2500 }]
    };

    const doc = migrateToV6(legacyDb);
    expect(doc._version).toBe(6);
    expect(doc.ui).toEqual({
      activeW: 'w1',
      activeO: 'o1',
      activeC: 'c1',
      activeTpl: 'tp_custom',
      nowYear: 305
    });
    expect(doc.stats).toEqual([{ date: '2026-10-24', chars: 2500 }]);
  });

  it('merges incoming backup into an existing DocV6 and serializes V6 backup', () => {
    const baseDoc = createEmptyDocV6();
    const incoming = goldenBackups[0].input;
    const merged = mergeBackupIntoDoc(baseDoc, incoming);

    expect(merged.worlds.w1?.name).toBe('艾瑟兰');
    expect(merged.orgs.o1?.name).toBe('暮光议会');
    expect(merged.chars.c1?.name).toBe('莉莉安');
    expect(merged.timeline.some((t) => t.name === '创世')).toBe(true);
    expect(merged.glossary.some((g) => g.term === '源石')).toBe(true);

    const json = serializeBackupV6(merged);
    const parsed = JSON.parse(json);
    expect(parsed._version).toBe(6);
    expect(parsed.worlds.w1.name).toBe('艾瑟兰');
  });
});
