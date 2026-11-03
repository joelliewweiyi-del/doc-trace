import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { processPdf } from '../src/index.js';

const invoice = () => readFile(new URL('../samples/invoice.pdf', import.meta.url));

// A fake model: right about the invoice number, wrong about the total.
function fakeModel(calls) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const fields = [
      { key: 'number', value: 'NFS-2026-0412', page: 1, quote: 'Invoice number: NFS-2026-0412' },
      { key: 'total', value: 'GBP 1,870.00', page: 1, quote: 'Total due: GBP 1,870.00' },
    ];
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ fields }) } }] }) };
  };
}

test('the trace check rejects what a model invents and keeps what it copied', async () => {
  const calls = [];
  const r = await processPdf(await invoice(), { env: { XAI_API_KEY: 'test' }, fetchFn: fakeModel(calls) });
  const byKey = Object.fromEntries(r.fields.map((f) => [f.key, f.status]));
  assert.equal(byKey.number, 'traced');
  assert.equal(byKey.total, 'rejected');
  assert.equal(byKey.iban, 'missing');
});

test('Grok on xAI is the default model and endpoint', async () => {
  const calls = [];
  const r = await processPdf(await invoice(), { env: { XAI_API_KEY: 'test' }, fetchFn: fakeModel(calls) });
  assert.equal(calls[0].url, 'https://api.x.ai/v1/chat/completions');
  assert.equal(calls[0].body.model, 'grok-4');
  assert.equal(r.extractor, 'llm:grok-4');
  assert.match(calls[0].body.messages[0].content, /--- PAGE 1 ---/);
});

test('LLM_BASE_URL and LLM_MODEL switch provider', async () => {
  const calls = [];
  await processPdf(await invoice(), {
    env: { LLM_API_KEY: 'k', LLM_BASE_URL: 'https://example.test/v1', LLM_MODEL: 'other' },
    fetchFn: fakeModel(calls),
  });
  assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(calls[0].body.model, 'other');
});

test('asking for the LLM without a key fails loudly', async () => {
  await assert.rejects(processPdf(await invoice(), { extractor: 'llm', env: {} }), /needs LLM_API_KEY/);
});

// Adversarial model output: wrong shapes must not crash the run, and must not be accepted.
function modelSays(content) {
  return async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
}

test('a page number sent as a numeric string is read as that page', async () => {
  const fields = [{ key: 'number', value: 'NFS-2026-0412', page: '1', quote: 'Invoice number: NFS-2026-0412' }];
  const r = await processPdf(await invoice(), { env: { XAI_API_KEY: 'k' }, fetchFn: modelSays(JSON.stringify({ fields })) });
  assert.equal(r.fields.find((f) => f.key === 'number').status, 'traced');
});

test('a model that returns fields in the wrong shape gets every field marked missing, not a crash', async () => {
  const r = await processPdf(await invoice(), { env: { XAI_API_KEY: 'k' }, fetchFn: modelSays(JSON.stringify({ fields: { number: 'x' } })) });
  assert.ok(r.fields.every((f) => f.status === 'missing'));
});
