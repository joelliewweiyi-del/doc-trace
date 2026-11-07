#!/usr/bin/env node
// Scores a model's CSV against answer-key.json: per field, per trap, and the rent roll differences.
// Usage: node bench/nl-huur/score.js <model-output.csv>
// Values are normalised before comparison (Dutch amounts, Dutch or ISO dates), so a model is not
// marked wrong for writing "€ 26.400,-" instead of 26400. Flag texts are printed for a person to judge.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const FIELDS = ['soort', 'huur_per_jaar', 'ingangsdatum', 'einddatum', 'opzegtermijn_maanden', 'indexatie', 'btw_belast', 'zekerheid_bedrag'];

// "€ 26.400,-", "26400", "26,400.00", "26.400,00" → 26400. Zero cents are dropped; other cents and a
// minus sign stay, so "26400,99" and "-26400" do not pass as 26400.
export function amount(s) {
  const minus = /-\s*(€|eur)?\s*\d/i.test(String(s ?? ''));
  let t = String(s ?? '').replace(/[^\d.,]/g, '').replace(/[.,]$/, '');
  if (!/\d/.test(t)) return null;
  const cents = t.match(/[.,](\d{2})$/);
  if (cents) t = t.slice(0, -3);
  const n = Number(t.replace(/[.,]/g, '')) + (cents ? Number(cents[1]) / 100 : 0);
  return minus ? -n : n;
}

// "2026-01-01", "1-1-2026", "01/01/2026", "1 januari 2026" → "2026-01-01". Anything else, and a day
// that does not exist (31 February), → null.
export function date(s) {
  const t = String(s ?? '').trim().toLowerCase();
  let y, mo, d, m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, mo, d] = [m[1], m[2], m[3]];
  else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) [y, mo, d] = [m[3], m[2], m[1]];
  else if ((m = t.match(/^(\d{1,2}) ([a-z]+) (\d{4})/)) && MONTHS.includes(m[2])) [y, mo, d] = [m[3], MONTHS.indexOf(m[2]) + 1, m[1]];
  else return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const real = new Date(`${iso}T00:00:00Z`);
  return !isNaN(real) && real.toISOString().startsWith(iso) ? iso : null;
}

function months(s) {
  const t = String(s ?? '').toLowerCase();
  const m = t.match(/-?\s*\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\s/g, '').replace(',', '.'));
  return /jaar/.test(t) ? n * 12 : n;
}

const NORM = {
  soort: (s) => (/290/.test(s) ? '290' : /230/.test(s) ? '230a' : /woon/i.test(s) ? 'woonruimte' : null),
  huur_per_jaar: amount,
  zekerheid_bedrag: amount,
  ingangsdatum: (s) => date(s) ?? '',
  // Empty or "onbepaald" means no end date; anything else that is not a date ("onbekend") is wrong.
  einddatum: (s) => (/^\s*(onbepaald(e tijd)?)?\s*$/i.test(s ?? '') ? '' : date(s) ?? 'unreadable'),
  opzegtermijn_maanden: months,
  indexatie: (s) => (/cpi|consumentenprijs/i.test(s) ? 'CPI' : /(^|[^\d.,-])3\s*%/.test(s) && !/maand|kwartaal|week/i.test(s) ? 'vast 3%' : String(s ?? '').trim() || null),
  btw_belast: (s) => (/^\s*(ja|yes|true|j)\b/i.test(s) ? 'ja' : /^\s*(nee|no|false|n)\b/i.test(s) ? 'nee' : null),
};

// A flag column counts as raised when it says something other than "none".
// "geen 90%-verklaring" is a flag; "geen afwijking" is not.
const raised = (s) => !/^\s*(-|–|nee|none|n\.?v\.?t\.?|geen( afwijking(en)?| bijzonderheden| signalen| opmerkingen)?)?\s*\.?\s*$/i.test(String(s ?? ''));

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0];
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// Words only, split between letters and digits: "Wevershof14," → " wevershof 14 ". Matching on whole
// words keeps "Wevershof 140" from matching "Wevershof 14".
const words = (s) => ` ${String(s).toLowerCase().replace(/([a-z])(\d)/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim()} `;

export function score(rows, key) {
  // Match every contract on the address column first. Only then try a missing contract on the other
  // columns, leaving out the flag columns: those may name another contract's address.
  const used = new Set();
  const street = (k) => words(k.adres.split(',')[0]);
  const claim = (k, text) => {
    const i = rows.findIndex((r, j) => !used.has(j) && words(text(r)).includes(street(k)));
    if (i >= 0) used.add(i);
    return i;
  };
  const match = new Map(key.contracts.map((k) => [k, claim(k, (r) => r.adres ?? '')]));
  const plain = ({ signalen, afwijking_huurlijst, ...rest }) => Object.values(rest).join(' ');
  for (const k of key.contracts) if (match.get(k) < 0) match.set(k, claim(k, plain));
  const results = key.contracts.map((k) => {
    const row = rows[match.get(k)];
    const fields = Object.fromEntries(FIELDS.map((f) => {
      const got = row ? NORM[f](row[f]) : undefined;
      const accept = Array.isArray(k[f]) ? k[f] : [k[f]];
      return [f, { got: row?.[f], ok: row != null && accept.includes(got) }];
    }));
    const flags = { signalen: row?.signalen ?? '', afwijking: row?.afwijking_huurlijst ?? '' };
    const traps = k.traps.map((t) => ({ ...t, ok: t.check in fields ? fields[t.check].ok : raised(flags[t.check]) }));
    return { n: k.n, adres: k.adres, found: !!row, fields, flags, traps, expected: k };
  });
  return { results, extraRows: rows.length - used.size };
}

function report({ results, extraRows }) {
  const out = [];
  const total = results.length * FIELDS.length;
  const right = results.reduce((s, r) => s + FIELDS.filter((f) => r.fields[f].ok).length, 0);
  out.push(`Contracts found: ${results.filter((r) => r.found).length}/${results.length}${extraRows ? ` (extra rows: ${extraRows})` : ''}`);
  out.push(`Fields right: ${right}/${total} (${Math.round((100 * right) / total)}%)`);
  for (const f of FIELDS) out.push(`  ${f.padEnd(22)} ${results.filter((r) => r.fields[f].ok).length}/${results.length}`);
  const traps = results.flatMap((r) => r.traps.map((t) => ({ ...t, r })));
  out.push(`\nTraps caught: ${traps.filter((t) => t.ok).length}/${traps.length}`);
  for (const t of traps) {
    const k = t.r.expected;
    const detail = t.check in t.r.fields ? `model: ${t.r.fields[t.check].got || '(empty)'}; expected: ${[].concat(k[t.check]).join(' or ')}` : `model: ${t.r.flags[t.check] || '(empty)'}`;
    out.push(`  ${t.ok ? '✓' : '✗'} ${String(t.r.n).padStart(2, '0')} ${t.label}\n       ${detail}`);
  }
  const clean = results.filter((r) => !r.expected.afwijking && raised(r.flags.afwijking));
  out.push(`\nRent roll differences flagged where there are none: ${clean.length}${clean.map((r) => `\n  ${String(r.n).padStart(2, '0')}: ${r.flags.afwijking}`).join('')}`);
  out.push('\nJudge by hand: a ✓ on a flag only means the column is not empty. Check that the reason is right:');
  for (const r of results) for (const t of r.traps) if (!(t.check in r.fields)) out.push(`  ${String(r.n).padStart(2, '0')} expected: ${r.expected[t.check === 'afwijking' ? 'afwijking' : 'signaal']}`);
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node bench/nl-huur/score.js <model-output.csv>'); process.exit(2); }
  const key = JSON.parse(readFileSync(new URL('answer-key.json', import.meta.url), 'utf8'));
  console.log(report(score(parseCsv(readFileSync(file, 'utf8')), key)));
}
