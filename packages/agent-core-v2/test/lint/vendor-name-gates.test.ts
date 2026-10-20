import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname, '..', '..', 'src');

const VENDOR_GATE_RE = /[!=]==?\s*'miki'|'miki'\s*[!=]==?|\bcase\s+'miki'\s*:/;

interface GateHit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      const rel = relative(SRC_ROOT, abs);
      if (rel === 'kosong' || rel === 'human' || rel === 'llm-adapter') continue;
      out.push(...walk(abs));
    } else if (abs.endsWith('.ts')) {
      out.push(abs);
    }
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

function findVendorGates(source: string, file: string): GateHit[] {
  const hits: GateHit[] = [];
  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    if (isCommentLine(line)) continue;
    VENDOR_GATE_RE.lastIndex = 0;
    if (VENDOR_GATE_RE.test(line)) {
      hits.push({ file, line: index + 1, text: line.trim() });
    }
  }
  return hits;
}

describe('vendor-name gates', () => {
  it('flags vendor compares and switch cases in code', () => {
    const hits = findVendorGates(
      [
        `if (provider.type === 'miki') return;`,
        `if (provider?.type !== 'miki' || provider.oauth === undefined) return;`,
        `const managed = 'miki' === vendor;`,
        `switch (type) { case 'miki': break; }`,
        `if (type == 'miki') return;`,
      ].join('\n'),
      'fixture.ts',
    );
    expect(hits.map((hit) => hit.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores comments, brand/env names, and miki as data', () => {
    const hits = findVendorGates(
      [
        '// v1 `provider.type === \'miki\'` gate restored.',
        ' * `provider.type === \'miki\'` parity): strict validation',
        '/* legacy: provider.type === \'miki\' */',
        'const home = process.env.MIKI_CODE_HOME;',
        `const event = { provider_type: 'miki' };`,
        `const provider = { type: 'miki', oauth };`,
        `registerProviderDefinition({ id: 'miki', ...rest });`,
      ].join('\n'),
      'fixture.ts',
    );
    expect(hits).toEqual([]);
  });

  it('finds no vendor-name gates in src/ outside kosong', () => {
    const hits = walk(SRC_ROOT).flatMap((file) =>
      findVendorGates(readFileSync(file, 'utf8'), relative(SRC_ROOT, file)),
    );
    expect(
      hits.map((hit) => `${hit.file}:${hit.line} ${hit.text}`),
      'vendor-name gate found outside kosong — ask the provider-definition / adapter registries instead',
    ).toEqual([]);
  });
});
