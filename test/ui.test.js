import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The page highlights quotes with String.replace. A quote containing "$'" or "$&" must not be
// treated as a replacement pattern, or document text gets duplicated into the page.
test('highlighting uses a replacer function, so "$" in a quote is literal', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const calls = [...html.matchAll(/html\.replace\(esc\(f\.quote\),\s*(\S{2})/g)].map((m) => m[1].trim());
  assert.ok(calls.length > 0);
  assert.ok(calls.every((c) => c.startsWith('()')), calls.join(' | '));
});
