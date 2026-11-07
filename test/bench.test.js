import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPages } from '../src/pdf.js';
import { amount, date, parseCsv, score, FIELDS } from '../bench/nl-huur/score.js';

const dir = new URL('../bench/nl-huur/', import.meta.url);
const key = JSON.parse(await readFile(new URL('answer-key.json', dir), 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ');

// The answer key is only worth something if it matches the documents. Each value must be printed
// in its contract, except on the scanned page: there it must be an image only, or the trap is gone.
test('every key value is in its contract text, and the scanned page has no text layer', async () => {
  for (const k of key.contracts) {
    const pages = await readPages(await readFile(new URL(`dataroom/${k.files[0]}`, dir)));
    const text = norm(pages.join('\n'));
    for (const [what, written] of Object.entries(k.written)) {
      const hidden = k.scanned?.hides.includes(what);
      assert.equal(text.includes(written), !hidden, `${k.files[0]}: ${what} "${written}" ${hidden ? 'readable on the scan' : 'missing'}`);
    }
    if (k.scanned) assert.ok(pages[k.scanned.page - 1].trim().length < 20, 'scanned page has a text layer');
  }
});

test('the rent roll differs from the documents exactly where the key says', async () => {
  const roll = parseCsv(await readFile(new URL('dataroom/Huurlijst verkoper.csv', dir), 'utf8'));
  const differs = key.contracts.filter((k) => {
    const r = roll.find((row) => row.nr === String(k.n));
    return amount(r['huur per jaar excl. btw']) !== [].concat(k.huur_per_jaar)[0] || (date(r.einddatum) ?? '') !== [].concat(k.einddatum)[0];
  });
  assert.deepEqual(differs.map((k) => k.n), [3, 14, 20]);
});

test('Dutch amounts and dates are read the way a model writes them', () => {
  for (const [s, n] of [['€ 26.400,-', 26400], ['26400', 26400], ['26,400.00', 26400], ['€ 26.400,00', 26400], ['2.950', 2950], ['', null]])
    assert.equal(amount(s), n, s);
  for (const [s, d] of [['2026-01-01', '2026-01-01'], ['1-1-2026', '2026-01-01'], ['01/07/2025', '2025-07-01'], ['29 februari 2028', '2028-02-29'], ['onbepaald', null]])
    assert.equal(date(s), d, s);
});

// A CSV written from the key itself must score everything; one wrong rent must cost exactly that trap.
test('the scorer gives full marks to the key and catches the old rent of contract 3', () => {
  const first = (v) => [].concat(v)[0];
  const csv = (rentFor3) => ['adres;' + FIELDS.join(';') + ';signalen;afwijking_huurlijst', ...key.contracts.map((k) => [
    k.adres, ...FIELDS.map((f) => (f === 'huur_per_jaar' && k.n === 3 ? rentFor3 : first(k[f]))), k.signaal ?? '', k.afwijking ?? '',
  ].join(';'))].join('\n');

  const perfect = score(parseCsv(csv(26400)), key);
  assert.ok(perfect.results.every((r) => r.found && FIELDS.every((f) => r.fields[f].ok)));
  assert.ok(perfect.results.every((r) => r.traps.every((t) => t.ok)));

  const wrong = score(parseCsv(csv('€ 24.000,-')), key);
  const missed = wrong.results.flatMap((r) => r.traps.filter((t) => !t.ok).map((t) => `${r.n} ${t.check}`));
  assert.deepEqual(missed, ['3 huur_per_jaar']);
});
