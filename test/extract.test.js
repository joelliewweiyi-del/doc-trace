import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { processPdf } from '../src/index.js';

const sample = (name) => readFile(new URL(`../samples/${name}`, import.meta.url));
const offline = { extractor: 'rules', env: {} };
const field = (r, key) => r.fields.find((f) => f.key === key);

test('the lease is classified and every field is traced offline', async () => {
  const r = await processPdf(await sample('lease.pdf'), offline);
  assert.equal(r.type, 'lease');
  assert.equal(r.extractor, 'rules');
  assert.deepEqual(r.fields.filter((f) => f.status !== 'traced'), []);
  assert.deepEqual(
    { value: field(r, 'rent').value, page: field(r, 'rent').page },
    { value: 'GBP 48,100', page: 2 },
  );
  assert.equal(field(r, 'break').value, '31 March 2029');
});

test('the invoice totals are traced to page 1', async () => {
  const r = await processPdf(await sample('invoice.pdf'), offline);
  assert.equal(r.type, 'invoice');
  assert.equal(field(r, 'total').value, 'GBP 870.00');
  assert.equal(field(r, 'iban').value, 'GB33 BUKB 2020 1555 5555 55');
  assert.ok(r.fields.every((f) => f.status === 'traced'));
});

test('the ID document is classified as id and its expiry is traced', async () => {
  const r = await processPdf(await sample('id-document.pdf'), offline);
  assert.equal(r.type, 'id');
  assert.equal(field(r, 'expiry').value, '11 January 2032');
  assert.ok(r.fields.every((f) => f.status === 'traced'));
});

test('auto mode stays offline when no key is set', async () => {
  const r = await processPdf(await sample('invoice.pdf'), { env: {} });
  assert.equal(r.extractor, 'rules');
});
