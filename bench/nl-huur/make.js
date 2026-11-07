// Generates the Dutch rental test set: the data room of a fictional seller with 20 lease contracts,
// their allonges, a notice letter and the seller's rent roll, with traps planted for a chat model.
// Writes dataroom/ (what a model gets), dataroom.zip and answer-key.json (what it must not get).
// Every name, address and amount is made up. The contract wording is our own, not a ROZ model text.
// Needs pdftoppm (poppler) for the scanned page and zip for the archive.
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { mkdir, rm, writeFile, readFile, mkdtemp, utimes } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const here = fileURLToPath(new URL('.', import.meta.url));
const room = join(here, 'dataroom');
const LANDLORD = 'Lindenhaeghe Vastgoed I B.V.';
const STAMP = new Date('2026-11-01T09:00:00Z'); // fixed PDF dates, so a rerun gives the same files

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const WORDS = { 2: 'twee', 3: 'drie', 5: 'vijf' };
const nl = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const dayMonth = (iso) => nl(iso).replace(/ \d{4}$/, '');
const dots = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const eur = (n) => `€ ${dots(n)},-`;
const ddmmyyyy = (iso) => iso.split('-').reverse().join('-');

// One entry per contract. `trap` says what a careless reader gets wrong; `expect` overrides the
// computed answer where the documents allow more than one reading.
const CONTRACTS = [
  { n: 1, kind: '290', tenant: 'Bloemenhandel Zonnedauw V.O.F.', street: 'Wevershof 14', postcode: '2011 KD', city: 'Haarlem', area: 85, use: 'winkel in bloemen en planten', start: '2024-03-01', end: '2029-02-28', renew: 5, notice: ['twaalf maanden', 12], rent: [21600, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [1800, 'jaar'], security: ['bankgarantie', 8030], signed: '2024-02-12' },
  { n: 2, kind: '230a', tenant: 'Ploegmaker Accountants B.V.', street: 'Brouwersdijk 41', postcode: '3811 MJ', city: 'Amersfoort', area: 240, use: 'kantoor', start: '2025-01-01', end: '2029-12-31', renew: 5, notice: ['zes maanden', 6], rent: [38400, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [4800, 'jaar'], security: ['bankgarantie', 13940], signed: '2024-12-03' },
  {
    n: 3, kind: '290', tenant: 'Slagerij Hendriksen B.V.', street: 'Kerkeweg 7', postcode: '4331 AB', city: 'Middelburg', area: 110, use: 'slagerij', start: '2023-04-01', end: '2028-03-31', renew: 5, notice: ['twaalf maanden', 12], rent: [24000, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [2100, 'jaar'], security: ['bankgarantie', 7800], signed: '2023-03-15',
    allonges: [{ date: '2025-11-20', rent: 26400, clauses: [
      'Partijen zijn een aanpassing van de huurprijs overeengekomen in verband met de door verhuurder uitgevoerde verduurzaming van het gehuurde (nieuwe kozijnen met isolatieglas en een warmtepomp).',
      `Met ingang van 1 januari 2026 bedraagt de huurprijs ${eur(26400)} per jaar, exclusief BTW. De jaarlijkse indexering volgens artikel 3.2 van de huurovereenkomst blijft van toepassing.`,
      'Alle overige bepalingen van de huurovereenkomst blijven ongewijzigd.',
    ] }],
    roll: { rent: 24000 }, // the seller's rent roll still shows the rent before the allonge
    traps: [['huur_per_jaar', 'Allonge verhoogt de huur'], ['afwijking', 'Huurlijst toont de huur van voor de allonge']],
  },
  { n: 4, kind: 'woon', tenant: 'M. de Bruijn-Kaya', street: 'Lepelaarstraat 18', postcode: '9722 TC', city: 'Groningen', area: 72, start: '2024-09-01', end: null, notice: ['één maand', 1], rent: [1250, 'maand'], index: 'CPI', vat: false, service: [75, 'maand'], security: ['waarborgsom', 2500], signed: '2024-08-19' },
  {
    n: 5, kind: '290', tenant: 'Fietsen Van Dalfsen B.V.', street: 'Gravelandsweg 63', postcode: '7511 ZS', city: 'Enschede', area: 160, use: 'fietsenwinkel met werkplaats', start: '2026-01-01', end: '2030-12-31', renew: 5, notice: ['twaalf maanden', 12], rent: [48100, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [3600, 'jaar'], security: ['bankgarantie', 17700], signed: '2025-12-04',
    recital: `Huurder huurt het gehuurde sinds 1 januari 2019 op grond van een eerdere huurovereenkomst, waarvoor laatstelijk een huurprijs van ${eur(41800)} per jaar gold. Partijen wensen die overeenkomst per 31 december 2025 te beëindigen en te vervangen door deze overeenkomst.`,
    traps: [['huur_per_jaar', 'Oude huur staat in de overwegingen']],
  },
  { n: 6, kind: '290', tenant: 'Kapsalon Studio Noor', street: 'Turfmarktplein 9', postcode: '2312 AB', city: 'Leiden', area: 70, use: 'kapsalon', start: '2022-06-01', end: '2027-05-31', renew: 5, notice: ['twaalf maanden', 12], rent: [19200, 'jaar'], index: 'CPI', vat: false, service: [1200, 'jaar'], security: ['waarborgsom', 4800], signed: '2022-05-10' },
  {
    n: 7, kind: '290', tenant: 'Boekhandel Het Leesteken B.V.', street: 'Ganzenmarkt 3', postcode: '6511 AB', city: 'Nijmegen', area: 190, use: 'boekhandel', start: '2023-01-01', end: '2027-12-31', renew: 5, notice: ['twaalf maanden', 12], rent: [30000, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [2400, 'jaar'], security: ['bankgarantie', 10890], signed: '2022-12-02',
    allonges: [
      { date: '2025-06-14', rent: 32500, clauses: [
        'Verhuurder verhuurt met ingang van 1 juli 2025 aanvullend aan huurder de opslagruimte op de eerste verdieping van het gebouw, groot ongeveer 40 m². Deze ruimte maakt vanaf die datum deel uit van het gehuurde.',
        `Met ingang van 1 juli 2025 bedraagt de huurprijs voor het gehuurde, inclusief de opslagruimte, ${eur(32500)} per jaar, exclusief BTW.`,
        'Alle overige bepalingen van de huurovereenkomst blijven ongewijzigd.',
      ] },
      { date: '2026-05-08', end: '2032-12-31', clauses: [
        'Partijen verlengen de huurovereenkomst, zoals gewijzigd bij allonge 1, tot en met 31 december 2032. Daarna wordt de huurovereenkomst voortgezet zoals bepaald in artikel 2.2 van de huurovereenkomst.',
        'Verhuurder brengt voor 1 januari 2027 nieuwe vloerbedekking aan in de winkelruimte op de begane grond.',
        'Alle overige bepalingen van de huurovereenkomst, waaronder de huurprijs, blijven ongewijzigd.',
      ] },
    ],
    traps: [['huur_per_jaar', 'Twee allonges: huur uit allonge 1'], ['einddatum', 'Twee allonges: einddatum uit allonge 2']],
  },
  { n: 8, kind: '230a', tenant: 'Studio Veldwerk Architecten B.V.', street: 'Vlasmarkt 27', postcode: '4811 VT', city: 'Breda', area: 310, use: 'kantoor', start: '2024-10-01', end: '2029-09-30', renew: 5, notice: ['zes maanden', 6], rent: [46500, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [6200, 'jaar'], security: ['bankgarantie', 15800], signed: '2024-09-11' },
  {
    n: 9, kind: '230a', tenant: 'Zorgbureau Lindehof B.V.', street: 'Kanaalweg 112', postcode: '5611 AZ', city: 'Eindhoven', area: 220, use: 'kantoor', start: '2025-02-01', end: '2030-01-31', renew: 5, notice: ['zes maanden', 6], rent: [2950, 'maand'], index: 'CPI', vat: false, service: [300, 'maand'], security: ['waarborgsom', 8850], signed: '2025-01-20',
    traps: [['huur_per_jaar', 'Huur staat per maand']],
  },
  { n: 10, kind: 'woon', tenant: 'R. Tahiri', street: 'Hazelaarlaan 5', postcode: '6523 GB', city: 'Nijmegen', area: 84, start: '2023-03-01', end: null, notice: ['één maand', 1], rent: [1480, 'maand'], index: 'CPI', vat: false, service: [60, 'maand'], security: ['waarborgsom', 2960], signed: '2023-02-14' },
  {
    n: 11, kind: '290', tenant: 'Delicatessen Ferreira V.O.F.', street: 'Nieuwstad 48', postcode: '7201 NP', city: 'Zutphen', area: 95, use: 'delicatessenwinkel', start: '2024-05-01', end: '2029-04-30', renew: 5, notice: ['twaalf maanden', 12], rent: [27750, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [1900, 'jaar'], security: ['bankgarantie', 9270], signed: '2024-04-18',
    scanPage: 2, // rent, indexation and security are on page 2, which is an image only
    traps: [['huur_per_jaar', 'Huurprijs staat op een gescande pagina'], ['zekerheid_bedrag', 'Bankgarantie staat op een gescande pagina']],
  },
  {
    n: 12, kind: '230a', tenant: 'Uitzendbureau Snelstart B.V.', street: 'Industrieweg 15', postcode: '8011 ZZ', city: 'Zwolle', area: 180, use: 'kantoor', start: '2025-07-01', end: '2030-06-30', renew: 5, notice: ['zes maanden', 6], rent: [29400, 'jaar'], index: 'CPI', vat: true, vat90: false, service: [3000, 'jaar'], security: ['bankgarantie', 10500], signed: '2025-06-09',
    signal: 'BTW-belaste verhuur zonder verklaring van huurder over het 90%-criterium',
    traps: [['signalen', 'BTW-belast zonder 90%-verklaring']],
  },
  { n: 13, kind: '290', tenant: 'Optiek Van Leeuwen B.V.', street: 'Steenweg 21', postcode: '4461 HB', city: 'Goes', area: 120, use: 'opticiënswinkel', start: '2023-11-01', end: '2028-10-31', renew: 5, notice: ['twaalf maanden', 12], rent: [33000, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [2400, 'jaar'], security: ['bankgarantie', 11000], signed: '2023-10-16' },
  {
    n: 14, kind: '290', tenant: 'Schoenen Bakker & Zn B.V.', street: 'Marktstraat 5', postcode: '7411 AB', city: 'Deventer', area: 140, use: 'schoenenwinkel', start: '2022-08-01', end: '2027-07-31', renew: 5, notice: ['twaalf maanden', 12], rent: [35100, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [2700, 'jaar'], security: ['bankgarantie', 11700], signed: '2022-07-07',
    roll: { rent: 31500 }, // two digits swapped in the seller's rent roll
    traps: [['afwijking', 'Huurlijst: cijfers omgedraaid (31.500 tegen 35.100)']],
  },
  {
    n: 15, kind: '290', tenant: 'IJssalon Dolce Vita', street: 'Boulevard 3', postcode: '4381 BJ', city: 'Vlissingen', area: 80, use: 'ijssalon', start: '2025-04-01', end: '2030-03-31', renew: 5, notice: ['twaalf maanden', 12], rent: [36000, 'jaar', 'zesendertigduizend vijfhonderd euro'], index: 'CPI', vat: true, vat90: true, service: [1500, 'jaar'], security: ['bankgarantie', 11200], signed: '2025-03-21',
    expect: { huur_per_jaar: [36000, 36500] },
    signal: 'Huurprijs in cijfers (€ 36.000) en in letters (36.500) verschillen',
    traps: [['signalen', 'Huurprijs in cijfers en letters verschilt']],
  },
  {
    n: 16, kind: '230a', tenant: 'Datalab Noord B.V.', street: 'Sontweg 12', postcode: '9723 AT', city: 'Groningen', area: 400, use: 'kantoor', start: '2024-01-01', end: '2028-12-31', renew: 5, notice: ['twaalf maanden', 12], rent: [52000, 'jaar'], index: 'vast 3%', vat: true, vat90: true, service: [8000, 'jaar'], security: ['bankgarantie', 18400], signed: '2023-12-01',
    traps: [['indexatie', 'Vaste indexatie van 3% in plaats van CPI']],
  },
  {
    n: 17, kind: '290', tenant: 'Lunchroom De Kade V.O.F.', street: 'Havenkade 4', postcode: '1131 AB', city: 'Volendam', area: 100, use: 'lunchroom', start: '2025-03-01', end: '2028-02-29', renew: 3, notice: ['twaalf maanden', 12], rent: [26000, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [1800, 'jaar'], security: ['bankgarantie', 8400], signed: '2025-02-17',
    expect: { einddatum: ['2028-02-29', '2030-02-28'] },
    signal: '290-bedrijfsruimte voor drie jaar: geldt op grond van art. 7:292 BW als vijf jaar, tenzij de rechter de afwijking heeft goedgekeurd',
    traps: [['signalen', '290-bedrijfsruimte met looptijd van drie jaar']],
  },
  {
    n: 18, kind: 'woon', tenant: 'L. Verhoeven', street: 'Spoorlaan 40', postcode: '5038 CB', city: 'Tilburg', area: 58, start: '2025-04-01', end: '2027-03-31', notice: ['één maand', 1], rent: [1390, 'maand'], index: 'CPI', vat: false, service: [55, 'maand'], security: ['waarborgsom', 2780], signed: '2025-03-12',
    temporary: true,
    expect: { einddatum: ['2027-03-31', ''] },
    signal: 'Tijdelijk huurcontract voor woonruimte na 1 juli 2024 (Wet vaste huurcontracten): geldt in beginsel voor onbepaalde tijd',
    traps: [['signalen', 'Tijdelijk huurcontract woonruimte na 1 juli 2024']],
  },
  { n: 19, kind: '230a', tenant: 'Juristen Collectief Oost B.V.', street: 'Velperweg 88', postcode: '6824 HJ', city: 'Arnhem', area: 260, use: 'kantoor', start: '2024-04-01', end: '2029-03-31', renew: 5, notice: ['zes maanden', 6], rent: [39000, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [5200, 'jaar'], security: ['bankgarantie', 13500], signed: '2024-03-13' },
  {
    n: 20, kind: '230a', tenant: 'Reisbureau Verre Kusten B.V.', street: 'Wilhelminasingel 30', postcode: '6221 BJ', city: 'Maastricht', area: 150, use: 'kantoor', start: '2021-07-01', end: '2026-06-30', renew: 5, notice: ['zes maanden', 6], rent: [24600, 'jaar'], index: 'CPI', vat: true, vat90: true, service: [2400, 'jaar'], security: ['bankgarantie', 8200], signed: '2021-06-02',
    letter: { date: '2025-12-15', ends: '2026-06-30', received: '2025-12-17' },
    roll: { end: '2031-06-30' }, // the seller's rent roll assumes the lease was renewed
    signal: 'Huurder heeft opgezegd tegen 30 juni 2026; de huur is op de peildatum geëindigd',
    traps: [['afwijking', 'Opgezegd, maar de huurlijst toont de huur als doorlopend']],
  },
];

// ---- documents --------------------------------------------------------------------------------

const parties = (c, role = 'gevestigd') => [
  'DE ONDERGETEKENDEN:',
  `1. ${LANDLORD}, gevestigd te Amsterdam, hierna te noemen "verhuurder";`,
  c.kind === 'woon' ? `2. ${c.tenant}, hierna te noemen "huurder";` : `2. ${c.tenant}, ${role} te ${c.city}, hierna te noemen "huurder";`,
  '',
];

function businessLease(c) {
  const [rent, per, words] = c.rent;
  const years = Number(c.end.slice(0, 4)) - Number(c.start.slice(0, 4)) + (c.end.slice(5) > c.start.slice(5) ? 1 : 0);
  const title = c.kind === '290'
    ? ['HUUROVEREENKOMST WINKELRUIMTE', 'en andere bedrijfsruimte in de zin van artikel 7:290 BW']
    : ['HUUROVEREENKOMST KANTOORRUIMTE', 'in de zin van artikel 7:230a BW'];
  const vatClause = !c.vat
    ? '3.4 De verhuur is vrijgesteld van BTW. Partijen kiezen niet voor met BTW belaste verhuur.'
    : c.vat90
      ? '3.4 Partijen kiezen voor met BTW belaste verhuur. Huurder verklaart dat hij het gehuurde blijvend zal gebruiken voor doeleinden waarvoor een volledig of nagenoeg volledig (ten minste 90%) recht op aftrek van BTW bestaat. Huurder betaalt over de huurprijs en de servicekosten de verschuldigde BTW.'
      : '3.4 Partijen kiezen voor met BTW belaste verhuur. Huurder betaalt over de huurprijs en de servicekosten de verschuldigde BTW.';
  const indexClause = c.index === 'CPI'
    ? `3.2 De huurprijs wordt jaarlijks per ${dayMonth(c.start)} aangepast op basis van de wijziging van het maandprijsindexcijfer volgens de consumentenprijsindex (CPI), reeks alle huishoudens (2015=100), gepubliceerd door het Centraal Bureau voor de Statistiek (CBS). De eerste aanpassing vindt plaats één jaar na de ingangsdatum.`
    : `3.2 De huurprijs wordt jaarlijks per ${dayMonth(c.start)} verhoogd met een vast percentage van 3% van de op dat moment geldende huurprijs. Een aanpassing op basis van een prijsindex vindt niet plaats.`;
  const security = c.security[0] === 'bankgarantie'
    ? `5.1 Huurder verstrekt uiterlijk op de ingangsdatum een bankgarantie ter hoogte van ${eur(c.security[1])}, afgegeven door een in Nederland gevestigde bank, die geldt tot ten minste zes maanden na het einde van deze overeenkomst.`
    : `5.1 Huurder betaalt uiterlijk op de ingangsdatum een waarborgsom van ${eur(c.security[1])}. Verhuurder betaalt over de waarborgsom geen rente.`;
  const monthly = per === 'maand';
  return [
    [
      ...title, '',
      ...parties(c),
      ...(c.recital ? ['OVERWEGENDE DAT:', c.recital, ''] : []),
      'KOMEN HET VOLGENDE OVEREEN:', '',
      'Artikel 1 Het gehuurde',
      `1.1 Verhuurder verhuurt aan huurder en huurder huurt van verhuurder de bedrijfsruimte aan de ${c.street}, ${c.postcode} ${c.city}, met een verhuurbaar vloeroppervlak van ongeveer ${c.area} m², hierna "het gehuurde".`,
      `1.2 Het gehuurde is uitsluitend bestemd om te worden gebruikt als ${c.use}. Huurder mag zonder voorafgaande schriftelijke toestemming van verhuurder geen andere bestemming aan het gehuurde geven.`,
      '1.3 Huurder heeft het gehuurde bezichtigd en aanvaardt het in de staat waarin het zich op de ingangsdatum bevindt, zoals vastgelegd in een door partijen te ondertekenen opleveringsrapport.',
      '',
      'Artikel 2 Duur, verlenging en opzegging',
      `2.1 Deze overeenkomst is aangegaan voor een periode van ${WORDS[years]} jaar, ingaande op ${nl(c.start)} en lopende tot en met ${nl(c.end)}.`,
      `2.2 Na afloop van de in 2.1 genoemde periode wordt deze overeenkomst voortgezet voor aansluitende perioden van ${WORDS[c.renew]} jaar, tenzij een van partijen tijdig opzegt.`,
      `2.3 Beëindiging van deze overeenkomst geschiedt door opzegging tegen het einde van een huurperiode met inachtneming van een termijn van ten minste ${c.notice[0]}. Opzegging geschiedt per deurwaardersexploot of aangetekende brief.`,
    ],
    [
      'Artikel 3 Huurprijs, indexering en servicekosten',
      `3.1 De huurprijs bedraagt bij aanvang ${eur(rent)} per ${per}${words ? ` (zegge: ${words})` : ''}${c.vat ? ', exclusief BTW' : ''}.`,
      indexClause,
      `3.3 Naast de huurprijs betaalt huurder een voorschot op de vergoeding voor bijkomende leveringen en diensten (servicekosten) van ${eur(c.service[0])} per ${c.service[1]}. Verhuurder verstrekt jaarlijks een overzicht van de werkelijke kosten; een verschil wordt verrekend.`,
      vatClause,
      '',
      'Artikel 4 Betaling',
      `4.1 De huurprijs en het voorschot op de servicekosten zijn per ${monthly ? 'kalendermaand' : 'kalenderkwartaal'} bij vooruitbetaling verschuldigd, uiterlijk op de eerste dag van ${monthly ? 'elke maand' : 'elk kwartaal'}.`,
      '4.2 Huurder mag de betalingsverplichtingen uit deze overeenkomst niet verrekenen met een vordering op verhuurder.',
      '4.3 Bij te late betaling is huurder over het openstaande bedrag een rente verschuldigd van 1% per maand, waarbij een gedeelte van een maand als een volle maand geldt.',
      '',
      'Artikel 5 Zekerheid',
      security,
      '5.2 Verhuurder mag de zekerheid aanspreken voor alles wat huurder op grond van deze overeenkomst aan verhuurder verschuldigd is.',
    ],
    [
      'Artikel 6 Onderhoud, gebruik en overige bepalingen',
      '6.1 Kleine herstellingen en het onderhoud van de binnenzijde van het gehuurde komen voor rekening van huurder. Groot onderhoud en onderhoud aan de constructie, het dak en de gevels komen voor rekening van verhuurder.',
      '6.2 Het is huurder niet toegestaan het gehuurde geheel of gedeeltelijk onder te verhuren of in gebruik te geven aan derden zonder voorafgaande schriftelijke toestemming van verhuurder.',
      '6.3 Huurder mag zonder schriftelijke toestemming van verhuurder geen veranderingen aanbrengen aan het gehuurde, met uitzondering van veranderingen die bij het einde van de huur zonder noemenswaardige kosten ongedaan kunnen worden gemaakt.',
      '6.4 Huurder sluit voor eigen rekening een verzekering af voor zijn inventaris en voor zijn aansprakelijkheid tegenover derden.',
      '6.5 Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement waarin het gehuurde ligt.',
      '',
      ...signatures(c, c.signed),
    ],
  ];
}

function homeLease(c) {
  const term = c.temporary
    ? [`2.1 Deze overeenkomst is aangegaan voor bepaalde tijd van twee jaar, ingaande op ${nl(c.start)} en eindigend op ${nl(c.end)}. De overeenkomst eindigt op die datum van rechtswege, zonder dat opzegging nodig is.`,
       `2.2 Verhuurder informeert huurder uiterlijk één maand voor het einde over de einddatum. Huurder kan de overeenkomst tussentijds opzeggen met een termijn van ${c.notice[0]}.`]
    : [`2.1 Deze overeenkomst is aangegaan voor onbepaalde tijd en gaat in op ${nl(c.start)}.`,
       `2.2 Huurder kan de overeenkomst opzeggen met een termijn van ${c.notice[0]}. Verhuurder kan de overeenkomst alleen opzeggen op de gronden die de wet noemt.`];
  return [
    [
      'HUUROVEREENKOMST WOONRUIMTE', '',
      ...parties(c),
      'KOMEN HET VOLGENDE OVEREEN:', '',
      'Artikel 1 De woning',
      `1.1 Verhuurder verhuurt aan huurder de zelfstandige woning aan de ${c.street}, ${c.postcode} ${c.city}, met een gebruiksoppervlakte van ongeveer ${c.area} m², hierna "de woning".`,
      '1.2 Huurder zal de woning gedurende de huurperiode zelf bewonen als hoofdverblijf.',
      '',
      'Artikel 2 Duur en opzegging',
      ...term,
    ],
    [
      'Artikel 3 Huurprijs en servicekosten',
      `3.1 De kale huurprijs bedraagt bij aanvang ${eur(c.rent[0])} per maand.`,
      '3.2 De huurprijs wordt jaarlijks per 1 juli aangepast met het percentage van de consumentenprijsindex (CPI), reeks alle huishoudens, gepubliceerd door het CBS, met inachtneming van de wettelijke maximale huurverhoging.',
      `3.3 Naast de kale huurprijs betaalt huurder een voorschot op de servicekosten van ${eur(c.service[0])} per maand voor de schoonmaak van de gemeenschappelijke ruimten en de glasbewassing. Verhuurder verstrekt jaarlijks een overzicht van de werkelijke servicekosten.`,
      '',
      'Artikel 4 Betaling',
      '4.1 De huur en het voorschot op de servicekosten zijn per maand bij vooruitbetaling verschuldigd, uiterlijk op de eerste dag van de maand.',
      '',
      'Artikel 5 Waarborgsom',
      `5.1 Huurder betaalt bij ondertekening een waarborgsom van ${eur(c.security[1])}. Verhuurder betaalt de waarborgsom binnen veertien dagen na het einde van de huur terug, onder aftrek van wat huurder dan nog verschuldigd is.`,
    ],
    [
      'Artikel 6 Overige bepalingen',
      '6.1 Huurder gebruikt de woning als een goed huurder en zorgt voor de kleine herstellingen.',
      '6.2 Huurder mag de woning niet geheel of gedeeltelijk onderverhuren zonder voorafgaande schriftelijke toestemming van verhuurder.',
      '6.3 Huisdieren zijn toegestaan, mits zij geen overlast veroorzaken.',
      '6.4 Op deze overeenkomst is Nederlands recht van toepassing.',
      '',
      ...signatures(c, c.signed),
    ],
  ];
}

const signatures = (c, date) => [
  `Aldus opgemaakt en in tweevoud ondertekend te ${c.city} op ${nl(date)}.`, '',
  `Namens verhuurder, ${LANDLORD}:`, '', '______________________________', '',
  `Huurder, ${c.tenant}:`, '', '______________________________',
];

function allonge(c, a, k) {
  const prev = c.allonges.slice(0, k - 1).map((p, i) => `allonge ${i + 1} van ${nl(p.date)}`);
  return [[
    `ALLONGE ${k} BIJ DE HUUROVEREENKOMST ${c.street.toUpperCase()}, ${c.city.toUpperCase()}`, '',
    ...parties(c),
    'OVERWEGENDE DAT:',
    `Partijen op ${nl(c.signed)} een huurovereenkomst hebben gesloten voor de bedrijfsruimte aan de ${c.street}, ${c.postcode} ${c.city} (hierna: "de huurovereenkomst")${prev.length ? `, die is gewijzigd bij ${prev.join(' en ')}` : ''};`, '',
    'KOMEN HET VOLGENDE OVEREEN:', '',
    ...a.clauses.map((t, i) => `${i + 1}. ${t}`), '',
    ...signatures(c, a.date),
  ]];
}

function noticeLetter(c, l) {
  return [[
    'AANGETEKEND', '',
    c.tenant, c.street, `${c.postcode} ${c.city}`, '',
    LANDLORD, 't.a.v. de directie', 'Amsterdam', '',
    `${c.city}, ${nl(l.date)}`, '',
    `Betreft: opzegging huurovereenkomst ${c.street}, ${c.city}`, '',
    'Geachte heer, mevrouw,', '',
    `Hierbij zeggen wij de huurovereenkomst voor de kantoorruimte aan de ${c.street}, ${c.postcode} ${c.city}, die wij op ${nl(c.signed)} met u hebben gesloten, op tegen ${nl(l.ends)}. Wij nemen daarbij de opzegtermijn van ${c.notice[0]} in acht.`, '',
    'Wij verzoeken u contact met ons op te nemen om een datum voor de eindinspectie af te spreken. Wij leveren het gehuurde op in de staat die de huurovereenkomst voorschrijft.', '',
    'Met vriendelijke groet,', '', c.tenant, 'De directie', '',
    `Voor ontvangst getekend namens verhuurder op ${nl(l.received)}:`, '______________________________',
  ]];
}

// ---- PDF --------------------------------------------------------------------------------------

async function renderPdf(pages) {
  const doc = await PDFDocument.create();
  doc.setCreationDate(STAMP);
  doc.setModificationDate(STAMP);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 10, lead = 14, width = 483;
  for (const paragraphs of pages) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    for (const p of paragraphs) {
      const f = /^(Artikel \d|[A-Z0-9 .,:"-]{6,}$)/.test(p) ? bold : font;
      const words = p.split(' ');
      let line = '';
      const flush = () => { page.drawText(line, { x: 56, y, size, font: f }); y -= lead; line = ''; };
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) > width) { flush(); line = w; } else line = next;
      }
      flush();
      if (y < 50) throw new Error(`page overflow: ${paragraphs[0]}`);
    }
  }
  return doc;
}

// Replaces one page with a grey, slightly rotated image of itself: a scan with no text layer.
async function scanPage(doc, pageNo) {
  const dir = await mkdtemp(join(tmpdir(), 'nl-huur-'));
  const single = await PDFDocument.create();
  const [copy] = await single.copyPages(doc, [pageNo - 1]);
  single.addPage(copy);
  await writeFile(join(dir, 'page.pdf'), await single.save());
  const r = spawnSync('pdftoppm', ['-r', '110', '-gray', '-png', '-singlefile', join(dir, 'page.pdf'), join(dir, 'page')]);
  if (r.status !== 0) throw new Error(`pdftoppm failed (install poppler): ${r.stderr || r.error}`);
  const png = await doc.embedPng(await readFile(join(dir, 'page.png')));
  doc.removePage(pageNo - 1);
  const page = doc.insertPage(pageNo - 1, [595, 842]);
  page.drawImage(png, { x: 8, y: -4, width: 595, height: 842, rotate: degrees(0.7) });
  await rm(dir, { recursive: true });
}

// ---- answer key and rent roll -----------------------------------------------------------------

const SOORT = { 290: '290', '230a': '230a', woon: 'woonruimte' };
const yearly = ([amount, per]) => (per === 'maand' ? amount * 12 : amount);

function answer(c, files) {
  const lastRent = [...(c.allonges ?? [])].reverse().find((a) => a.rent)?.rent;
  const lastEnd = [...(c.allonges ?? [])].reverse().find((a) => a.end)?.end;
  const end = c.letter?.ends ?? lastEnd ?? c.end ?? '';
  const key = {
    n: c.n, files, adres: `${c.street}, ${c.city}`, huurder: c.tenant,
    soort: SOORT[c.kind],
    huur_per_jaar: lastRent ?? yearly(c.rent),
    ingangsdatum: c.start,
    einddatum: end,
    opzegtermijn_maanden: c.notice[1],
    indexatie: c.index,
    btw_belast: c.vat ? 'ja' : 'nee',
    zekerheid_bedrag: c.security[1],
    ...c.expect,
    signaal: c.signal ?? null,
    afwijking: c.roll ? describeRoll(c) : null,
    traps: (c.traps ?? []).map(([check, label]) => ({ check, label })),
    // How the values are written in the documents. The test checks each one is in the text,
    // except those on a scanned page, which must not be.
    written: { huur: eur(c.rent[0]), zekerheid: eur(c.security[1]), ingang: nl(c.start), opzeg: c.notice[0] },
    scanned: c.scanPage ? { page: c.scanPage, hides: ['huur', 'zekerheid'] } : null,
  };
  return key;
}

function describeRoll(c) {
  if (c.roll.rent) return `Huurlijst: ${dots(c.roll.rent)} per jaar; documenten: ${dots(answerRent(c))}`;
  return `Huurlijst: einddatum ${ddmmyyyy(c.roll.end)}; documenten: opgezegd tegen ${ddmmyyyy(c.letter.ends)}`;
}
const answerRent = (c) => [...(c.allonges ?? [])].reverse().find((a) => a.rent)?.rent ?? yearly(c.rent);

function rentRoll() {
  const head = 'Nr;Adres;Postcode;Plaats;Huurder;Soort;Huur per jaar excl. BTW;Ingangsdatum;Einddatum;Opmerking';
  const rows = CONTRACTS.map((c) => {
    const end = c.roll?.end ?? [...(c.allonges ?? [])].reverse().find((a) => a.end)?.end ?? c.end;
    const note = c.n === 7 ? 'incl. opslag 1e verdieping' : c.temporary ? 'tijdelijk' : '';
    return [c.n, c.street, c.postcode, c.city, c.tenant, SOORT[c.kind], dots(c.roll?.rent ?? answerRent(c)), ddmmyyyy(c.start), end ? ddmmyyyy(end) : 'onbepaald', note].join(';');
  });
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'; // BOM and CRLF, so Excel opens it as UTF-8
}

// ---- write ------------------------------------------------------------------------------------

await rm(room, { recursive: true, force: true });
await mkdir(room, { recursive: true });
const key = [];
for (const c of CONTRACTS) {
  const nr = String(c.n).padStart(2, '0');
  const where = `${c.street} ${c.city}`;
  const docs = [[`${nr} Huurovereenkomst ${where}.pdf`, c.kind === 'woon' ? homeLease(c) : businessLease(c), c.scanPage]];
  (c.allonges ?? []).forEach((a, i) => docs.push([`${nr}${'abc'[i]} Allonge ${i + 1} ${where}.pdf`, allonge(c, a, i + 1)]));
  if (c.letter) docs.push([`${nr}${'abc'[c.allonges?.length ?? 0]} Opzegging ${where}.pdf`, noticeLetter(c, c.letter)]);
  for (const [name, pages, scan] of docs) {
    const doc = await renderPdf(pages);
    if (scan) await scanPage(doc, scan);
    await writeFile(join(room, name), await doc.save());
  }
  key.push(answer(c, docs.map(([name]) => name)));
}
await writeFile(join(room, 'Huurlijst verkoper.csv'), rentRoll());
await writeFile(join(here, 'answer-key.json'), JSON.stringify({ peildatum: '2026-11-01', contracts: key }, null, 2) + '\n');

// The archive stores modification times: fix them, so the zip is the same on every run.
for (const f of [...key.flatMap((k) => k.files), 'Huurlijst verkoper.csv']) await utimes(join(room, f), STAMP, STAMP);
await utimes(room, STAMP, STAMP);
await rm(join(here, 'dataroom.zip'), { force: true });
const z = spawnSync('zip', ['-qrX', 'dataroom.zip', 'dataroom', '-x', '*.DS_Store'], { cwd: here });
if (z.status !== 0) throw new Error(`zip failed: ${z.stderr || z.error}`);
const traps = key.reduce((s, k) => s + k.traps.length, 0);
console.log(`wrote ${key.reduce((s, k) => s + k.files.length, 0)} PDFs and the rent roll to bench/nl-huur/dataroom/, dataroom.zip, answer-key.json (${key.length} contracts, ${traps} traps)`);
