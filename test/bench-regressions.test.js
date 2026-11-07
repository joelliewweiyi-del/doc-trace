import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile, writeFile, mkdtemp, mkdir, copyFile, symlink, rm, readdir,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  FIELDS, score,
} from '../bench/nl-huur/score.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bench = new URL('../bench/nl-huur/', import.meta.url);
const key = JSON.parse(await readFile(new URL('answer-key.json', bench), 'utf8'));
const contract = (n) => key.contracts.find((k) => k.n === n);
const first = (value) => Array.isArray(value) ? value[0] : value;

function rowFor(k) {
  return {
    adres: k.adres,
    huurder: k.huurder,
    ...Object.fromEntries(FIELDS.map((f) => [f, String(first(k[f]))])),
    signalen: k.signaal ?? '',
    afwijking_huurlijst: k.afwijking ?? '',
  };
}

function fieldOK(n, field, value) {
  const k = contract(n);
  return score(
    [{ ...rowFor(k), [field]: value }],
    { contracts: [k] },
  ).results[0].fields[field].ok;
}


// Spec 1: wrong monetary values must not become correct through normalization.
test('money normalization preserves sign and nonzero cents', () => {
  for (const k of key.contracts) {
    for (const field of ['huur_per_jaar', 'zekerheid_bedrag']) {
      const n = first(k[field]);
      for (const value of [
        String(n + 1),
        String(n - 1),
        `-${n}`,
        `${n}.99`,
        `${n},99`,
      ]) {
        assert.equal(fieldOK(k.n, field, value), false,
          `${k.n} ${field}: ${value}`);
      }
    }
  }
});

// Spec 1: unknown or malformed end dates are not indefinite tenancy answers.
test('unknown end dates do not receive credit for an empty expected date', () => {
  for (const n of [4, 10, 18]) {
    for (const value of ['onbekend', 'niet vermeld', '2026-13-01', '31/02/2026']) {
      assert.equal(fieldOK(n, 'einddatum', value), false, `${n}: ${value}`);
    }
  }
});

// Spec 1: fixed annual 3% is distinct from CPI, other rates and monthly rates.
test('indexation scoring distinguishes rate and period', () => {
  for (const value of ['CPI', 'consumentenprijsindex']) {
    assert.equal(fieldOK(1, 'indexatie', value), true);
    assert.equal(fieldOK(16, 'indexatie', value), false);
  }
  for (const value of ['vast 3%', '3% per jaar']) {
    assert.equal(fieldOK(16, 'indexatie', value), true);
    assert.equal(fieldOK(1, 'indexatie', value), false);
  }
  for (const value of ['13% per jaar', '2,3% per jaar', '3% per maand']) {
    assert.equal(fieldOK(16, 'indexatie', value), false, value);
  }
});

// Spec 2: cross-references never steal another contract's row, regardless of order.
test('address matching ignores references in flag columns', () => {
  const rows = key.contracts.map((k) => ({
    ...rowFor(k),
    signalen: key.contracts.map((other) => other.adres).join('; '),
    afwijking_huurlijst: key.contracts.map((other) => other.adres).join('; '),
  }));
  for (const ordered of [rows, [...rows].reverse()]) {
    const result = score(ordered, key);
    assert.equal(result.extraRows, 0);
    for (const r of result.results) {
      assert.equal(r.found, true, r.adres);
      for (const field of FIELDS) {
        assert.equal(r.fields[field].ok, true, `${r.n} ${field}`);
      }
    }
  }

  const missing = score(rows.filter((r) => r.adres !== contract(1).adres), key);
  assert.equal(missing.results.find((r) => r.n === 1).found, false);
  for (const r of missing.results.filter((r) => r.n !== 1)) {
    assert.equal(r.found, true, r.adres);
    assert.ok(FIELDS.every((f) => r.fields[f].ok), r.adres);
  }
});

// Spec 1: equivalent notice periods pass, but negative and fractional mismatches fail.
test('notice periods preserve duration and sign', () => {
  for (const k of key.contracts) {
    const expected = k.opzegtermijn_maanden;
    for (const value of [
      String(expected),
      `${expected} maanden`,
      ...(expected === 12 ? ['1 jaar'] : []),
    ]) {
      assert.equal(fieldOK(k.n, 'opzegtermijn_maanden', value), true,
        `${k.n}: ${value}`);
    }
    for (const value of [
      `${expected + 1} maanden`,
      `-${expected} maanden`,
      ...(expected === 12 ? ['1,5 jaar', '1.5 jaar'] : []),
    ]) {
      assert.equal(fieldOK(k.n, 'opzegtermijn_maanden', value), false,
        `${k.n}: ${value}`);
    }
  }
});

// Spec 1: fixed annual 3% cannot be confused with a decrease or quarterly increase.
test('fixed indexation preserves sign and annual frequency', () => {
  for (const value of ['3% per jaar', 'vast 3%']) {
    assert.equal(fieldOK(16, 'indexatie', value), true, value);
  }
  for (const value of [
    '-3% per jaar', '3% per kwartaal', '0,3% per jaar',
    '0.3% per jaar', '30% per jaar',
  ]) {
    assert.equal(fieldOK(16, 'indexatie', value), false, value);
  }
});

// Spec 2: a different house number must not match through a street-address prefix.
test('address matching rejects a house number that merely starts with the expected number', () => {
  const k = contract(1);
  const result = score(
    [{
      ...rowFor(k),
      adres: 'Wevershof 140, Haarlem',
    }],
    { contracts: [k] },
  );
  assert.equal(result.results[0].found, false);
  assert.equal(result.extraRows, 1);
});

// Spec: generated PDFs, answer key, rent roll and archive are byte-identical on reruns.
// Needs pdftoppm and zip, as make.js does; CI machines without them skip this test.
const hasTools = ['pdftoppm', 'zip'].every((t) => spawnSync(t, ['-v']).error === undefined);
test('generator output is byte-identical across separate runs', { timeout: 120_000, skip: !hasTools && 'needs pdftoppm and zip' }, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'nl-huur-determinism-'));
  try {
    const generated = join(sandbox, 'bench', 'nl-huur');
    await mkdir(generated, { recursive: true });
    await writeFile(join(sandbox, 'package.json'), '{"type":"module"}\n');
    await symlink(join(root, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
    await copyFile(
      new URL('make.js', bench),
      join(generated, 'make.js'),
    );

    function generate() {
      const result = spawnSync(process.execPath, [join(generated, 'make.js')], {
        cwd: sandbox,
        encoding: 'utf8',
        timeout: 50_000,
      });
      assert.equal(result.error, undefined, String(result.error));
      assert.equal(result.status, 0, result.stderr);
    }

    async function snapshot() {
      const names = [
        'answer-key.json',
        'dataroom.zip',
        ...(await readdir(join(generated, 'dataroom')))
          .sort()
          .map((name) => `dataroom/${name}`),
      ];
      return Object.fromEntries(await Promise.all(
        names.map(async (name) => [name, await readFile(join(generated, name))]),
      ));
    }

    generate();
    const before = await snapshot();
    await delay(2200); // Cross ZIP's two-second timestamp boundary.
    generate();
    const after = await snapshot();

    assert.deepEqual(Object.keys(after), Object.keys(before));
    for (const name of Object.keys(before)) {
      assert.deepEqual(after[name], before[name], name);
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
