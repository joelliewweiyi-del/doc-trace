// Generates the synthetic sample PDFs. Every name, address and number here is made up.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';

const DOCS = {
  'lease.pdf': [
    [
      'COMMERCIAL LEASE AGREEMENT',
      '',
      'This lease is made on 14 February 2026 between:',
      'Landlord: Harbourline Property Fund I LP',
      'Tenant: Copperleaf Coffee Ltd',
      '',
      '1. Premises',
      'Unit 4B, 22 Canal Street, London E2 8QR, with a lettable area of 185 sq m.',
      '',
      '2. Term',
      'The term starts on 1 April 2026 and ends on 31 March 2031.',
      'The tenant may break the lease on 31 March 2029 with six months notice.',
    ],
    [
      '3. Rent',
      'The annual rent is GBP 48,100, payable quarterly in advance.',
      'Rent is reviewed each year on 1 April in line with CPI, with a floor of 1% and a cap of 4%.',
      '',
      '4. Deposit',
      'The tenant pays a rent deposit of GBP 12,025 before the term starts.',
      '',
      '5. Service charge',
      'The tenant pays a service charge of GBP 22 per sq m per year.',
      '',
      'Signed for the landlord: A. Okafor',
      'Signed for the tenant: M. Lindqvist',
    ],
  ],
  'invoice.pdf': [
    [
      'INVOICE',
      '',
      'Northgate Facility Services Ltd',
      'Invoice number: NFS-2026-0412',
      'Invoice date: 3 October 2026',
      'Due date: 2 November 2026',
      '',
      'Bill to: Harbourline Property Fund I LP',
      'Property: 22 Canal Street, London E2 8QR',
      '',
      'Description                                   Amount',
      'Replace boiler pump, unit 4B                  GBP 640.00',
      'Call-out fee                                  GBP 85.00',
      '',
      'Net amount: GBP 725.00',
      'VAT (20%): GBP 145.00',
      'Total due: GBP 870.00',
      '',
      'Pay to IBAN GB33 BUKB 2020 1555 5555 55',
    ],
  ],
  'id-document.pdf': [
    [
      'IDENTITY DOCUMENT (SPECIMEN, NOT VALID)',
      '',
      'Document type: Passport',
      'Document number: X4Q91827',
      'Surname: Lindqvist',
      'Given names: Maja Elin',
      'Nationality: Swedish',
      'Date of birth: 9 June 1988',
      'Date of issue: 12 January 2022',
      'Date of expiry: 11 January 2032',
    ],
  ],
};

for (const [name, pages] of Object.entries(DOCS)) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 56, y: 780 - i * 20, size: 11, font }));
  }
  await writeFile(new URL(name, import.meta.url), await doc.save());
  console.log('wrote samples/' + name);
}
