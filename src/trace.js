// The core rule: a field is only accepted when its quote appears on the page it names,
// and its value appears inside that quote. This check does not trust the extractor,
// so it holds the same way for the offline rules and for an LLM.

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

export function verifyField(pages, field) {
  if (field.value == null || field.value === '') return { status: 'missing', reason: 'not found in the document' };
  const { page, quote, value } = field;
  if (!Number.isInteger(page) || page < 1 || page > pages.length)
    return { status: 'rejected', reason: `page ${page} does not exist` };
  if (!quote) return { status: 'rejected', reason: 'no quote given' };
  if (!norm(pages[page - 1]).includes(norm(quote)))
    return { status: 'rejected', reason: `quote not found on page ${page}` };
  if (!norm(quote).includes(norm(value)))
    return { status: 'rejected', reason: 'value is not in the quote' };
  return { status: 'traced', reason: null };
}

export function verify(pages, fields) {
  return fields.map((f) => ({ ...f, ...verifyField(pages, f) }));
}
