import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { processPdf, verify } from './index.js';

const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT) || 3000;

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/')
      return send(res, 200, await readFile(new URL('public/index.html', root)), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/samples') {
      const files = (await readdir(new URL('samples/', root))).filter((f) => f.endsWith('.pdf'));
      return send(res, 200, files);
    }
    const sample = url.pathname.match(/^\/api\/samples\/([\w.-]+\.pdf)$/);
    if (req.method === 'GET' && sample)
      return send(res, 200, await processPdf(await readFile(new URL(`samples/${sample[1]}`, root))));
    if (req.method === 'POST' && url.pathname === '/api/extract')
      return send(res, 200, await processPdf(await body(req)));
    if (req.method === 'POST' && url.pathname === '/api/verify') {
      const { pages, fields } = JSON.parse(await body(req));
      return send(res, 200, verify(pages, fields));
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(port, () => console.log(`doc-trace running at http://localhost:${port}`));
