import { extractText, getDocumentProxy } from 'unpdf';

// Returns one string per page. Page numbers in the rest of the code are 1-based.
export async function readPages(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}
