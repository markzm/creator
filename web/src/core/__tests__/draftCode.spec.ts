import { describe, expect, it } from 'vitest';
import goldenDraftCodes from '../__fixtures__/golden-draft-codes.json';
import { buildCode, parseCode, parseRawCodeItems } from '../draftCode';

describe('draftCode — Golden Master 203 vectors & edge cases', () => {
  it('has 203 golden draft code test vectors', () => {
    expect(goldenDraftCodes.length).toBe(203);
  });

  it('passes 100% of golden-draft-codes.json for buildCode and parseCode byte-for-byte', () => {
    for (const vec of goldenDraftCodes) {
      const code = buildCode(vec.inputData, vec.order, vec.prefix);
      expect(code, `buildCode mismatch on: ${vec.desc}`).toBe(vec.expectedCode);

      if (code) {
        const parsed = parseCode(code, vec.customOrder);
        expect(parsed, `parseCode mismatch on: ${vec.desc}`).toEqual(vec.expectedParsed);
      }
    }
  });

  it('returns null when all fields are empty', () => {
    expect(buildCode({ name: '', alias: '' }, ['name', 'alias'], 'CC2')).toBeNull();
  });

  it('supports customOrder when parsing template character codes', () => {
    const customOrder = ['tpl_t1_0', 'tpl_t1_1', 'tpl_t1_2'];
    const input = {
      tpl_t1_0: '莱昂',
      tpl_t1_1: '圣骑士',
      tpl_t1_2: '守护誓言'
    };
    const code = buildCode(input, customOrder, 'CC2');
    expect(code).toBeTruthy();
    const parsed = parseCode(code!, customOrder);
    expect(parsed.kind).toBe('char');
    expect(parsed.data).toEqual(input);
  });

  it('extracts raw items for CC3I / CC3T / CC3P via parseRawCodeItems', () => {
    const code = buildCode({ insp: '蒸汽朋克\u001F齿轮都市' }, ['insp'], 'CC3I');
    expect(code).toBeTruthy();
    const res = parseRawCodeItems(code!);
    expect(res.kind).toBe('insp');
    expect(res.items).toEqual(['蒸汽朋克', '齿轮都市']);
  });

  it('throws on invalid prefix or corrupted checksum', () => {
    expect(() => parseCode('INVALID-12345')).toThrow('代码前缀无效');
    const valid = buildCode({ name: '测试' }, ['name'], 'CC2')!;
    const corrupted = valid.slice(0, 5) + '00000' + valid.slice(10);
    expect(() => parseCode(corrupted)).toThrow('校验未通过');
  });
});
