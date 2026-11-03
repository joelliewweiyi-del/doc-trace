import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const PORT = 3190 + Math.floor(Math.random() * 100);
const url = (p) => `http://127.0.0.1:${PORT}${p}`;
let server;

before(async () => {
  server = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(PORT), XAI_API_KEY: '', LLM_API_KEY: '' }, cwd: new URL('..', import.meta.url) });
  await new Promise((ok) => server.stdout.once('data', ok));
});
after(() => server.kill());

test('a sample PDF is extracted end to end over HTTP', async () => {
  const r = await (await fetch(url('/api/samples/lease.pdf'))).json();
  assert.equal(r.type, 'lease');
  assert.ok(r.fields.every((f) => f.status === 'traced'));
});

test('bad input is a 400 with a message, not a 500', async () => {
  for (const [path, body] of [['/api/extract', 'not a pdf'], ['/api/verify', '{bad'], ['/api/verify', '{"pages":null,"fields":[]}'], ['/api/verify', '{"pages":["a"],"fields":"x"}'], ['/api/verify', '{"pages":["a"],"fields":[null]}']]) {
    const res = await fetch(url(path), { method: 'POST', body });
    assert.equal(res.status, 400, `${path} ${body}`);
    assert.ok((await res.json()).error);
  }
});

test('only PDFs inside samples/ are served', async () => {
  for (const p of ['/api/samples/..%2Fpackage.json', '/api/samples/../package.json', '/api/samples/package.json', '/api/samples/missing.pdf'])
    assert.equal((await fetch(url(p))).status, 404, p);
});

test('upload of a real PDF works', async () => {
  const res = await fetch(url('/api/extract'), { method: 'POST', body: await readFile(new URL('../samples/invoice.pdf', import.meta.url)) });
  assert.equal((await res.json()).type, 'invoice');
});
