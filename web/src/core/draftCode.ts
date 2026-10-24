import { CHAR_OLD, CHAR_ORDER, ORG_ORDER, WORLD_ORDER } from './legacy/fields';

export const SEP = '\u001F';

export type DraftCodeKind = 'org' | 'world' | 'insp' | 'timeline' | 'template' | 'char';

export function b64e(b: Uint8Array): string {
  let s = '';
  const C = 0x8000;
  for (let i = 0; i < b.length; i += C) {
    s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + C)));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64d(str: string): Uint8Array {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    b[i] = bin.charCodeAt(i);
  }
  return b;
}

export function h32(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function htag(b: Uint8Array): string {
  return h32(b).toString(36).padStart(5, '0').slice(-5);
}

/**
 * Encodes entity field data into a versioned, checksummed draft code.
 * Matches legacy `CC.buildCode` in legacy/index.html L1185-L1191 byte-for-byte.
 */
export function buildCode(
  data: Record<string, string | undefined>,
  order: string[],
  prefix: string
): string | null {
  const arr = order.map((id) => data[id] || '');
  if (!arr.some((v) => v)) return null;
  while (arr.length && arr[arr.length - 1] === '') arr.pop();
  const raw = new TextEncoder().encode(arr.join(SEP));
  return prefix + 'r-' + htag(raw) + b64e(raw);
}

const KIND_MAP: Record<string, DraftCodeKind> = {
  CC2O: 'org',
  CC3W: 'world',
  CC3I: 'insp',
  CC3T: 'timeline',
  CC3P: 'template',
  CC1: 'char',
  CC2: 'char'
};

/**
 * Decodes and validates a draft code into `{ data, kind }`.
 * Matches legacy `CC.parseCode` in legacy/index.html L1194-L1225 byte-for-byte.
 */
export function parseCode(
  code: string,
  customOrder?: string[] | null
): { data: Record<string, string>; kind: DraftCodeKind } {
  const c = String(code).trim().replace(/\s+/g, '');
  if (!/^CC(1|2|2O|3W|3I|3T|3P)/.test(c)) {
    throw new Error('代码前缀无效');
  }
  let ver: string;
  let tag: string;
  let payloadStr: string;
  if (
    c.startsWith('CC2O') ||
    c.startsWith('CC3W') ||
    c.startsWith('CC3I') ||
    c.startsWith('CC3T') ||
    c.startsWith('CC3P')
  ) {
    ver = c.slice(0, 4);
    if (c[5] !== '-') throw new Error('格式不正确');
    tag = c.slice(6, 11);
    payloadStr = c.slice(11);
  } else {
    ver = c.slice(0, 3);
    if (c[4] !== '-') throw new Error('格式不正确');
    tag = c.slice(5, 10);
    payloadStr = c.slice(10);
  }
  const bytes = b64d(payloadStr);
  if (htag(bytes) !== tag) {
    throw new Error('校验未通过');
  }
  const raw = new TextDecoder().decode(bytes);
  const arr = raw.length ? raw.split(SEP) : [];
  let order: string[];
  if (ver === 'CC2O') order = ORG_ORDER;
  else if (ver === 'CC3W') order = WORLD_ORDER;
  else if (ver === 'CC1') order = CHAR_OLD;
  else if (ver === 'CC2') order = customOrder || CHAR_ORDER;
  else order = customOrder || [];
  const data: Record<string, string> = {};
  order.forEach((id, i) => {
    data[id] = arr[i] || '';
  });
  return { data, kind: KIND_MAP[ver] || 'char' };
}

/**
 * Helper to extract raw SEP-split array for CC3I / CC3T / CC3P codes.
 */
export function parseRawCodeItems(code: string): { ver: string; kind: DraftCodeKind; items: string[] } {
  const c = String(code).trim().replace(/\s+/g, '');
  if (!/^CC(1|2|2O|3W|3I|3T|3P)/.test(c)) {
    throw new Error('代码前缀无效');
  }
  let ver: string;
  let tag: string;
  let payloadStr: string;
  if (
    c.startsWith('CC2O') ||
    c.startsWith('CC3W') ||
    c.startsWith('CC3I') ||
    c.startsWith('CC3T') ||
    c.startsWith('CC3P')
  ) {
    ver = c.slice(0, 4);
    if (c[5] !== '-') throw new Error('格式不正确');
    tag = c.slice(6, 11);
    payloadStr = c.slice(11);
  } else {
    ver = c.slice(0, 3);
    if (c[4] !== '-') throw new Error('格式不正确');
    tag = c.slice(5, 10);
    payloadStr = c.slice(10);
  }
  const bytes = b64d(payloadStr);
  if (htag(bytes) !== tag) {
    throw new Error('校验未通过');
  }
  const raw = new TextDecoder().decode(bytes);
  const items = raw.length ? raw.split(SEP) : [];
  return { ver, kind: KIND_MAP[ver] || 'char', items };
}
