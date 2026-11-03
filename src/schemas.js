// What to extract per document type. `pattern` drives the offline extractor:
// its first capture group is the value, and the whole line it matched is the quote.
export const SCHEMAS = {
  lease: {
    detect: /\blease\b/i,
    fields: [
      { key: 'landlord', label: 'Landlord', pattern: /^Landlord: (.+)$/ },
      { key: 'tenant', label: 'Tenant', pattern: /^Tenant: (.+)$/ },
      { key: 'premises', label: 'Premises', pattern: /^(Unit .+?), with a lettable area/ },
      { key: 'area', label: 'Lettable area', pattern: /lettable area of (\d{1,3}(?:,\d{3})*(?:\.\d+)? sq m)/ },
      { key: 'start', label: 'Start date', pattern: /term starts on (\d{1,2} \w+ \d{4})/ },
      { key: 'end', label: 'End date', pattern: /ends on (\d{1,2} \w+ \d{4})/ },
      { key: 'break', label: 'Break date', pattern: /break the lease on (\d{1,2} \w+ \d{4})/ },
      { key: 'rent', label: 'Annual rent', pattern: /annual rent is ([A-Z]{3} \d{1,3}(?:,\d{3})*(?:\.\d+)?)/ },
      { key: 'indexation', label: 'Rent review', pattern: /in line with (CPI|RPI)/ },
      { key: 'deposit', label: 'Deposit', pattern: /deposit of ([A-Z]{3} \d{1,3}(?:,\d{3})*(?:\.\d+)?)/ },
    ],
  },
  invoice: {
    detect: /\binvoice\b/i,
    fields: [
      { key: 'supplier', label: 'Supplier', pattern: /^(.+ (?:Ltd|LLP|plc|B\.V\.|GmbH))$/ },
      { key: 'number', label: 'Invoice number', pattern: /^Invoice number: (.+)$/ },
      { key: 'date', label: 'Invoice date', pattern: /^Invoice date: (.+)$/ },
      { key: 'due', label: 'Due date', pattern: /^Due date: (.+)$/ },
      { key: 'property', label: 'Property', pattern: /^Property: (.+)$/ },
      { key: 'net', label: 'Net amount', pattern: /^Net amount: (.+)$/ },
      { key: 'vat', label: 'VAT', pattern: /^VAT \(\d+%\): (.+)$/ },
      { key: 'total', label: 'Total due', pattern: /^Total due: (.+)$/ },
      { key: 'iban', label: 'IBAN', pattern: /IBAN ([A-Z]{2}\d{2}[ A-Z0-9]+)$/ },
    ],
  },
  id: {
    detect: /\b(passport|identity document|identity card)\b/i,
    fields: [
      { key: 'docType', label: 'Document type', pattern: /^Document type: (.+)$/ },
      { key: 'docNumber', label: 'Document number', pattern: /^Document number: (.+)$/ },
      { key: 'surname', label: 'Surname', pattern: /^Surname: (.+)$/ },
      { key: 'givenNames', label: 'Given names', pattern: /^Given names: (.+)$/ },
      { key: 'birthDate', label: 'Date of birth', pattern: /^Date of birth: (.+)$/ },
      { key: 'expiry', label: 'Date of expiry', pattern: /^Date of expiry: (.+)$/ },
    ],
  },
};

export function classify(pages, schemas = SCHEMAS) {
  const first = pages[0] ?? '';
  return Object.keys(schemas).find((t) => schemas[t].detect.test(first)) ?? null;
}
