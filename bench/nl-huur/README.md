# Dutch rental test set

The question this set answers: does a plain chat model (Claude, ChatGPT) get a Dutch data room right on its own? If it does, a dedicated tool adds little. If it misses the traps below, those misses are the case for building one.

The data room belongs to a fictional seller: 20 lease contracts (retail and other 290 premises, offices under 230a, housing), 3 allonges, 1 notice letter and the seller's rent roll. Every name, address and amount is made up. The contract wording is our own and follows no ROZ model text.

## Run it

1. Open a new chat in Claude and, separately, in ChatGPT. Use the strongest model each offers, with code execution or analysis on. Note which model you used.
2. Attach `bench/nl-huur/dataroom.zip`, and nothing else from this folder: `answer-key.json` and this README hold the answers. If a chat cannot open a zip, attach the 25 files from `dataroom/`.
3. Paste the prompt below.
4. Save the CSV it returns as `bench/nl-huur/runs/<chat>-<model>-<date>.csv`.
5. Score it:

```sh
node bench/nl-huur/score.js bench/nl-huur/runs/<file>.csv
```

The scorer prints the fields that are right, the traps caught and any rent roll differences flagged where there are none. For the flag columns it only checks that something was said, so read the printed reasons and judge them yourself.

### Prompt

```text
In de bijlage zit de dataroom van een vastgoedportefeuille die wij overwegen te kopen: huurovereenkomsten, allonges, een brief en de huurlijst van de verkoper. Peildatum: 1 november 2026.

Maak één CSV-bestand, met een puntkomma als scheidingsteken, met precies één rij per huurovereenkomst (een allonge of brief is geen aparte rij) en deze kolommen:
adres;huurder;soort;huur_per_jaar;ingangsdatum;einddatum;opzegtermijn_maanden;indexatie;btw_belast;zekerheid_bedrag;signalen;afwijking_huurlijst

- adres: straat en huisnummer, plaats
- soort: 290, 230a of woonruimte
- huur_per_jaar: de huur die op de peildatum geldt volgens de huurovereenkomst en alle allonges en brieven, in hele euro's per jaar, exclusief BTW en servicekosten, zonder indexatie te berekenen, alleen cijfers
- ingangsdatum en einddatum: JJJJ-MM-DD. einddatum is het einde van de lopende huurperiode volgens de documenten; leeg bij onbepaalde tijd
- opzegtermijn_maanden: een getal
- indexatie: CPI, of de afwijkende afspraak
- btw_belast: ja of nee
- zekerheid_bedrag: de bankgarantie of waarborgsom in hele euro's, alleen cijfers
- signalen: wat juridisch of feitelijk opvalt aan deze huurovereenkomst, anders leeg
- afwijking_huurlijst: waar de huurlijst van de verkoper afwijkt van de documenten, anders leeg

Lees elk document volledig. Geef het CSV-bestand als download.
```

## The traps

| Nr | Trap | What a careless reader reports |
|---|---|---|
| 03 | Allonge raises the rent from 1 Jan 2026 | the old rent, € 24.000 |
| 03 | Seller's rent roll shows the rent from before the allonge | no difference |
| 05 | The recital names the previous lease's rent, € 41.800 | € 41.800 instead of € 48.100 |
| 07 | Allonge 1 raises the rent; allonge 2 extends the term and says the rent stays "unchanged" | € 30.000, or end date 2027 |
| 09 | Rent stated per month | € 2.950 as the yearly rent |
| 11 | Page 2 (rent, indexation, bank guarantee) is a scan with no text layer | empty or invented values |
| 12 | Taxed letting (BTW) without the tenant's 90% statement | nothing |
| 14 | Rent roll swaps two digits: 31.500 against 35.100 | no difference |
| 15 | Rent in figures (36.000) and in words (36.500) differ | one of the two, without a flag |
| 16 | Fixed 3% indexation | CPI |
| 17 | 290 premises let for three years; art. 7:292 BW makes it five unless a court approved | nothing |
| 18 | Temporary housing lease signed after 1 July 2024 (Wet vaste huurcontracten) | nothing |
| 20 | Tenant gave notice to 30 June 2026; the rent roll shows the lease running to 2031 | lease still running |

Eight contracts have no trap: they show whether the plain reading is right at all.

## Go or no-go

A suggested bar, for Joel to set: if both chats get at least 95% of the fields right and catch at least 12 of the 15 traps with the right reasons, a dedicated tool adds little and we stop. Below that, the misses are the case for building it.

## Regenerate

```sh
node bench/nl-huur/make.js
```

This needs `pdftoppm` (poppler) for the scanned page and `zip`. The output is the same byte for byte on every run. `npm test` checks that every value in the answer key is printed in its contract, that the scanned page has no text layer, that the rent roll differs only at contracts 3, 14 and 20, and that the scorer catches a wrong rent.
