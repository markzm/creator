#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'legacy', 'index.html');
const verifyOnly = process.argv.includes('--verify');

const html = fs.readFileSync(htmlPath, 'utf-8');
const lines = html.split('\n');

function sliceLines(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

// Create sandbox to evaluate legacy data and pure functions
const sandbox = {
  CC: {
    LANG: 'zh',
    uid: (prefix) => (prefix || '') + 'fixed_uid_123',
    t: () => ({ unnamed: '未命名', restoreFormatErr: '文件格式不正确' }),
    DB: { worlds: {}, orgs: {}, chars: {}, templates: {}, timeline: [], plots: [], scenes: [], glossary: [], stats: [] }
  },
  TextEncoder,
  TextDecoder,
  btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
  atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
  Date: { now: () => 1700000000000 }
};

vm.createContext(sandbox);

// 1. Evaluate INSP_RAW, INSP, CHAR_OLD, CG, OG, WG, T, TUT (L515 - L834)
const dictCode = sliceLines(515, 834);
vm.runInContext(dictCode, sandbox);

// 2. Evaluate Draft Code functions (L1169 - L1225)
const draftCodeBlock = sliceLines(1169, 1225);
vm.runInContext(draftCodeBlock, sandbox);

// 3. Evaluate parseYear (L1369 - L1380)
const parseYearBlock = sliceLines(1369, 1380);
vm.runInContext(parseYearBlock, sandbox);

// 4. Evaluate DEFAULT_TEMPLATES (L2505 - L2511) and normalizeBackup (L2689 - L2718)
const tplBlock = sliceLines(2505, 2511);
const normBlock = sliceLines(2689, 2718);
vm.runInContext(tplBlock + '\n' + normBlock, sandbox);

const PERSONA_MAP = {
  name: 'name', alias: 'alias', personality: 'personality', good_at: 'good_at', bad_at: 'bad_at',
  habit: 'habit', like: 'like', hate: 'hate', feature: 'feature', catchphrase: 'catchphrase',
  dream: 'dream', secret: 'secret', power: 'power', fear: 'fear'
};

const AVATARS = ['🦊','🐺','🐱','🦁','🐯','🦉','🐉','🦄','🌙','⭐','🔥','❄️','🌸','⚡','🗡️','🛡️','📖','🎭','🎨','☕','🍀','🌊','🍁','👑'];

const HEADER = '// AUTO-GENERATED FROM legacy/index.html BY scripts/extract-legacy.mjs - DO NOT EDIT MANUALLY\n\n';

// Build fields.ts
const fieldsTs = `${HEADER}export interface LegacyFieldDef {
  id: string;
  l: string;
  lE: string;
  r: number;
  w?: number;
  ph: string;
  h: string;
}

export interface LegacyFieldGroup {
  t: string;
  tE: string;
  f: LegacyFieldDef[];
}

export const CHAR_OLD: string[] = ${JSON.stringify(sandbox.CC.CHAR_OLD, null, 2)};

export const CG: LegacyFieldGroup[] = ${JSON.stringify(sandbox.CC.CG, null, 2)};

export const CHAR_ORDER: string[] = ${JSON.stringify(sandbox.CC.CHAR_ORDER, null, 2)};

export const OG: LegacyFieldGroup[] = ${JSON.stringify(sandbox.CC.OG, null, 2)};

export const ORG_ORDER: string[] = ${JSON.stringify(sandbox.CC.ORG_ORDER, null, 2)};

export const WG: LegacyFieldGroup[] = ${JSON.stringify(sandbox.CC.WG, null, 2)};

export const WORLD_ORDER: string[] = ${JSON.stringify(sandbox.CC.WORLD_ORDER, null, 2)};

export const DEFAULT_TEMPLATES: Record<string, { name: string; fields: string[] }> = ${JSON.stringify(sandbox.CC.DEFAULT_TEMPLATES, null, 2)};
`;

// Build insp.ts
const inspTs = `${HEADER}export const INSP_RAW: Record<string, string> = ${JSON.stringify(sandbox.CC.INSP_RAW, null, 2)};

export const INSP: Record<string, string[]> = ${JSON.stringify(sandbox.CC.INSP, null, 2)};

export const PERSONA_MAP: Record<string, string> = ${JSON.stringify(PERSONA_MAP, null, 2)};

export const AVATARS: string[] = ${JSON.stringify(AVATARS, null, 2)};
`;

// Serialize T with functions converted to serializable strings or preserved in TS
function serializeI18nObj(obj) {
  const entries = Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'function') {
      const fnStr = v
        .toString()
        .replace(
          /^\(([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_]+)\)\s*=>/,
          '($1: string | number, $2: string | number) =>'
        )
        .replace(/^([a-zA-Z0-9_]+)\s*=>/, '($1: string | number) =>');
      return `    ${k}: ${fnStr}`;
    }
    return `    ${k}: ${JSON.stringify(v)}`;
  });
  return `{\n${entries.join(',\n')}\n  }`;
}

const i18nTs = `${HEADER}export const T = {
  zh: ${serializeI18nObj(sandbox.CC.T.zh)},
  en: ${serializeI18nObj(sandbox.CC.T.en)}
};

export const TUT: { zh: [string, string][]; en: [string, string][] } = ${JSON.stringify(sandbox.CC.TUT, null, 2)};
`;

// Build Golden Master Fixtures for Draft Codes
const goldenDraftCodes = [];

function addDraftCase(desc, prefix, order, data, customOrder = undefined) {
  const code = sandbox.CC.buildCode(data, order, prefix);
  const parsed = code ? sandbox.CC.parseCode(code, customOrder) : null;
  goldenDraftCodes.push({
    desc,
    prefix,
    order,
    customOrder: customOrder || null,
    inputData: data,
    expectedCode: code,
    expectedParsed: parsed
  });
}

// 1. Standard entity types (CC2, CC1, CC2O, CC3W, CC3I, CC3T, CC3P)
addDraftCase('char CC2 basic Chinese', 'CC2', sandbox.CC.CHAR_ORDER, {
  name: '艾德里安·沃尔斯',
  alias: '暗影之刃',
  gender: '女',
  age: '外表18岁 / 实际217岁',
  personality: '表面冷淡，实则极度护短',
  dream: '想找到一个家'
});

addDraftCase('char CC1 legacy order', 'CC1', sandbox.CC.CHAR_OLD, {
  name: '旧版角色',
  weapon: '无锋长剑',
  extra: '尾部字段测试'
});

addDraftCase('org CC2O full special chars & emoji', 'CC2O', sandbox.CC.ORG_ORDER, {
  o_name: '暮光议会 🌙✨',
  o_alias: '暗夜之手 | Night Hand',
  o_creed_line: '「在黑暗中守护光」\n第二行测试',
  o_secret: '包含 surrogate pair 🧝‍♀️🧙‍♂️🐉 與繁體字'
});

addDraftCase('world CC3W with trailing empty fields', 'CC3W', sandbox.CC.WORLD_ORDER, {
  w_name: '艾瑟兰',
  w_type: '大陆',
  w_era: '复兴纪',
  w_core: '魔法正在消失'
});

addDraftCase('world CC3W last field filled', 'CC3W', sandbox.CC.WORLD_ORDER, {
  w_name: '首尾测试世界',
  w_extra: '最后一个字段非空'
});

addDraftCase('insp CC3I custom inspiration code', 'CC3I', ['insp'], {
  insp: ['赛博朋克义体', '霓虹雨夜', '失控AI'].join('\u001F')
});

addDraftCase('timeline CC3T code', 'CC3T', ['timeline'], {
  timeline: JSON.stringify([{ year: '302', name: '雾谷之战', desc: '死伤十万' }])
});

addDraftCase('template CC3P code', 'CC3P', ['templates'], {
  templates: JSON.stringify({ tp_1: { id: 'tp_1', name: '网文模板', fields: ['姓名', '金手指', '等级'] } })
});

// Generate 195 deterministic diverse cases from INSP pools
const charKeys = sandbox.CC.CHAR_ORDER;
const worldKeys = sandbox.CC.WORLD_ORDER;
const orgKeys = sandbox.CC.ORG_ORDER;
const inspPools = Object.values(sandbox.CC.INSP);

for (let i = 0; i < 195; i++) {
  const mode = i % 3;
  const samplePool = inspPools[i % inspPools.length];
  const sampleText = samplePool[i % samplePool.length] || `测试文本_${i}`;
  if (mode === 0) {
    const d = {};
    d[charKeys[0]] = `角色_${i}_${sampleText.slice(0, 8)}`;
    d[charKeys[(i * 7) % charKeys.length]] = `${sampleText} | 附加 Emoji 🗡️🛡️ #${i}`;
    d[charKeys[(i * 13) % charKeys.length]] = `多行\n文本\t测试_${i}`;
    addDraftCase(`generated char case #${i}`, 'CC2', charKeys, d);
  } else if (mode === 1) {
    const d = {};
    d[orgKeys[0]] = `组织_${i}_${sampleText.slice(0, 6)}`;
    d[orgKeys[(i * 5) % orgKeys.length]] = sampleText;
    addDraftCase(`generated org case #${i}`, 'CC2O', orgKeys, d);
  } else {
    const d = {};
    d[worldKeys[0]] = `世界_${i}_${sampleText.slice(0, 6)}`;
    d[worldKeys[(i * 3) % worldKeys.length]] = sampleText;
    addDraftCase(`generated world case #${i}`, 'CC3W', worldKeys, d);
  }
}

// Golden Backups
const rawBackupSamples = [
  {
    desc: 'v5.3 full backup',
    input: {
      version: 5.3,
      worlds: { w1: { id: 'w1', name: '艾瑟兰', data: { w_name: '艾瑟兰' } } },
      orgs: { o1: { id: 'o1', name: '暮光议会', data: { o_name: '暮光议会' } } },
      chars: { c1: { id: 'c1', name: '莉莉安', data: { name: '莉莉安' } } },
      templates: { t1: { id: 't1', name: '速写', fields: ['姓名'] } },
      timeline: [{ name: '创世', year: '100' }],
      plots: [{ id: 'p1', title: '第一卷', acts: [] }],
      scenes: [{ id: 's1', title: '开场戏' }],
      glossary: [{ id: 'g1', term: '源石', def: '矿物' }],
      stats: [{ d: '2026-10-24', n: 1200 }]
    }
  },
  {
    desc: 'v5.0 backup without plots/scenes',
    input: {
      version: 5,
      worlds: { w1: { id: 'w1', name: '旧世界', data: {} } },
      orgs: {},
      chars: { c1: { id: 'c1', name: '旧角色', data: {} } }
    }
  },
  {
    desc: 'v4 legacy characters field',
    input: {
      characters: {
        c_old: { id: 'c_old', name: '四代角色', data: { name: '四代角色' } }
      }
    }
  },
  {
    desc: 'v4 bare single character object',
    input: {
      name: '单角色裸对象',
      gender: '男',
      age: '24'
    }
  },
  {
    desc: 'v4 map of character objects',
    input: {
      ch_a: { name: '甲', data: { name: '甲' }, updatedAt: 1700000000000 },
      ch_b: { name: '乙', data: { name: '乙' }, updatedAt: 1700000000000 }
    }
  }
];

const goldenBackups = rawBackupSamples.map((s) => ({
  desc: s.desc,
  input: s.input,
  expectedNormalized: sandbox.CC.normalizeBackup(s.input)
}));

// Golden Years
const yearInputs = [
  '',
  '302',
  '第三纪元 302 年',
  '约三百年前',
  '两百年前雾谷之战',
  '百年前',
  '千年前的浩劫',
  '远古时代',
  '上古神战',
  '创世纪元',
  '混沌纪（1000-2500）',
  '12岁村庄被焚',
  '未知年份',
  '9999年',
  '第7年'
];

const goldenYears = yearInputs.map((input) => ({
  input,
  expected: sandbox.CC.parseYear(input)
}));

const outLegacyDir = path.join(rootDir, 'web', 'src', 'core', 'legacy');
const outFixturesDir = path.join(rootDir, 'web', 'src', 'core', '__fixtures__');

const outputs = [
  [path.join(outLegacyDir, 'fields.ts'), fieldsTs],
  [path.join(outLegacyDir, 'insp.ts'), inspTs],
  [path.join(outLegacyDir, 'i18n.ts'), i18nTs],
  [path.join(outFixturesDir, 'golden-draft-codes.json'), JSON.stringify(goldenDraftCodes, null, 2) + '\n'],
  [path.join(outFixturesDir, 'golden-backups.json'), JSON.stringify(goldenBackups, null, 2) + '\n'],
  [path.join(outFixturesDir, 'golden-years.json'), JSON.stringify(goldenYears, null, 2) + '\n']
];

if (verifyOnly) {
  let ok = true;
  for (const [filePath, content] of outputs) {
    if (!fs.existsSync(filePath)) {
      console.error(`[FAIL] Missing generated file: ${filePath}`);
      ok = false;
      continue;
    }
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing !== content) {
      console.error(`[FAIL] Out of sync: ${filePath}`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log(`[OK] Verified all ${outputs.length} generated legacy files & golden fixtures (${goldenDraftCodes.length} draft code vectors).`);
} else {
  fs.mkdirSync(outLegacyDir, { recursive: true });
  fs.mkdirSync(outFixturesDir, { recursive: true });
  for (const [filePath, content] of outputs) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Generated: ${path.relative(rootDir, filePath)}`);
  }
  console.log(`Done! Generated ${goldenDraftCodes.length} golden draft code vectors.`);
}
