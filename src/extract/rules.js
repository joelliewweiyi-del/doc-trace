// Offline extractor: regexes from the schema, line by line. No API key needed.
export function extractWithRules(pages, schema) {
  return schema.fields.map(({ key, label, pattern }) => {
    for (let p = 0; p < pages.length; p++) {
      for (const line of pages[p].split('\n')) {
        const m = line.trim().match(pattern);
        if (m) return { key, label, value: m[1].trim(), page: p + 1, quote: line.trim() };
      }
    }
    return { key, label, value: null, page: null, quote: null };
  });
}
