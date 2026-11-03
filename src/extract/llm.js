// LLM extractor over any OpenAI-compatible chat API. Grok (xAI) is the default.
// Set LLM_API_KEY (or XAI_API_KEY). LLM_BASE_URL and LLM_MODEL switch provider or model.

export function llmConfig(env = process.env) {
  const apiKey = env.LLM_API_KEY || env.XAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.LLM_BASE_URL || 'https://api.x.ai/v1',
    model: env.LLM_MODEL || 'grok-4.7',
  };
}

export function buildPrompt(pages, schema) {
  const doc = pages.map((t, i) => `--- PAGE ${i + 1} ---\n${t}`).join('\n\n');
  const keys = schema.fields.map((f) => `- ${f.key}: ${f.label}`).join('\n');
  return [
    'Extract these fields from the document below.',
    keys,
    '',
    'Answer with JSON only: {"fields":[{"key":"...","value":"...","page":1,"quote":"..."}]}',
    'Rules: copy `value` exactly as written in the document. `quote` is the exact sentence or line',
    'that contains the value, copied character for character. `page` is the page number of that quote.',
    'If a field is not in the document, use null for value, page and quote. Never guess.',
    '',
    doc,
  ].join('\n');
}

export async function extractWithLlm(pages, schema, config, fetchFn = fetch) {
  const res = await fetchFn(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: buildPrompt(pages, schema) }],
    }),
  });
  if (!res.ok) throw new Error(`LLM call failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  const parsed = JSON.parse(body.choices[0].message.content);
  const list = Array.isArray(parsed.fields) ? parsed.fields.filter((f) => f && typeof f === 'object') : [];
  const byKey = new Map(list.map((f) => [f.key, f]));
  return schema.fields.map(({ key, label }) => {
    const f = byKey.get(key) ?? {};
    return { key, label, value: f.value ?? null, page: f.page ?? null, quote: f.quote ?? null };
  });
}
