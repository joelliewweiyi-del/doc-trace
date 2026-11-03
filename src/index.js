import { readPages } from './pdf.js';
import { SCHEMAS, classify } from './schemas.js';
import { verify } from './trace.js';
import { extractWithRules } from './extract/rules.js';
import { extractWithLlm, llmConfig } from './extract/llm.js';

export { SCHEMAS, classify, verify, readPages };

// PDF bytes in, traced fields out. `extractor` is 'auto' (LLM when a key is set), 'rules' or 'llm'.
export async function processPdf(bytes, { extractor = 'auto', env = process.env, fetchFn } = {}) {
  const pages = await readPages(bytes);
  const type = classify(pages);
  if (!type) return { type: null, pages, extractor: null, fields: [], error: 'unknown document type' };
  const schema = SCHEMAS[type];
  const config = llmConfig(env);
  const useLlm = extractor === 'llm' || (extractor === 'auto' && config);
  if (useLlm && !config) throw new Error('extractor "llm" needs LLM_API_KEY or XAI_API_KEY');
  const raw = useLlm ? await extractWithLlm(pages, schema, config, fetchFn) : extractWithRules(pages, schema);
  return { type, pages, extractor: useLlm ? `llm:${config.model}` : 'rules', fields: verify(pages, raw) };
}
