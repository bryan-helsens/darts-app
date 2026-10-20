# Sanapolis Darts 🎯

Webapp voor het maandelijkse dartstoernooi in **Brasserie 't Oud Sanatorium** (Sijsele), elke derde zaterdag van de maand.

- **Voor iedereen** (geen login): kalender met de volgende speelavond, **vooraf online inschrijven**, live schema tijdens de avond, uitslagen, seizoensranking, spelersprofielen, reglement en "Nieuw? Zo werkt het".
- **Voor de tv in de zaal** (`/tv`): schermvullend en donker; wisselt automatisch tussen de borden, het schema, de highlights en de ranking.
- **Voor de wedstrijdleider** (op de gsm): check-in en betalingen, toernooi starten met een geschatte eindtijd, borden en wachtrij, scores, A- en B-schema, avond afsluiten.
- **Voor de schrijvers aan het bord**: scores invoeren met een pincode, ook als de wifi even wegvalt.
- **Voor de admins**: spelers, seizoenen (puntentabel, beste X van Y, legs per ronde), speelavonden en gebruikers.

> Deze README is geschreven voor een opvolger zonder technische achtergrond. Technische details staan in [CLAUDE.md](CLAUDE.md).

---

## 1. Een speelavond in 10 stappen (handleiding wedstrijdleider)

1. **Inloggen** op `/login` met je account. Je blijft ingelogd op je gsm.
2. Ga naar **Beheer → Avond openen**. Rechtsboven staat de **score-pin** voor de schrijvers. (Op de gsm zit de navigatie in de balk onderaan; afmelden doe je met het pijltje rechtsboven.)
3. **Check-in**: wie zich vooraf online inschreef, staat al in de lijst (label *vooraf*; een nieuwe speler heeft ook *nieuw · online*). Zoek elke speler en tik op **Aanwezig?** en **€5?**. Een online nieuwe speler wordt pas publiek zichtbaar als je hem aanwezig zet; was het eigenlijk iemand die al bestond, voeg ze dan samen via Spelers → speler → *Samenvoegen*. Nieuwe speler? Typ de naam en tik op **+ Nieuwe speler**. De app waarschuwt als er al iemand met een gelijkaardige naam bestaat. Bovenaan zie je het aantal aanwezigen, het aantal dat betaald heeft en de prijzenpot.
4. Spelers die vooraf ingeschreven waren maar niet komen, laat je gewoon op "Aanwezig?" staan. Om 18u30 sluit de inschrijving; met **Toch heropenen** kan je nog spelers toevoegen.
5. **Starten**: kies bovenaan waarop de loting de sterkste spelers spreidt (**Elo**, **Ranking** of **Willekeurig**; standaard Elo), en dan de poule-indeling. Bij elke optie staat de **geschatte eindtijd**. Is die te laat, dan stelt de app aanpassingen voor (bv. poules best of 1). Tik op **Toernooi starten**. De poules worden geloot, met de sterkste spelers (volgens de ranking) in verschillende poules.
6. **Tip:** druk via **Afdrukken** meteen de poulebladen af (of bewaar ze als PDF). Valt het internet volledig uit, dan kan je op papier verder.
7. **Borden**: hier zie je wat er **nu** op elk bord speelt, wat er **straks** komt en wie de score kan **schrijven** (de verliezer van de vorige match op dat bord, of anders de speler die het langst vrij is). Tik op een bord om de uitslag in te voeren, de match uit te stellen of naar een ander bord te verplaatsen. Een bord erbij of eraf? Kies **Borden wijzigen**. Geeft iemand op? Kies **Speler geeft op**.
8. De schrijvers openen op hun eigen gsm het adres `/score`, geven de pincode in en tikken op hun bord. Per speler tikken ze het **aantal gewonnen legs** aan, dan **Verder** en **Ja, opslaan**. Werd er een match gespeeld die niet op een bord stond? Via **Andere match invoeren** kan die ook.
9. Als de poules gespeeld zijn: ga naar **Poules**. Bij een volledig gelijke stand op de grens A/B kies je **Barrage spelen** of **Loting**. Tik dan op **A- en B-schema maken**.
10. Als alles gespeeld is: **Afsluiten → Avond afsluiten**. De eindplaatsen en punten gaan naar de ranking.

**Een score achteraf invoeren?** Het tabblad **Matchen** toont alle matchen van de avond (te spelen, gespeeld of alle), met een zoekveld. Tik op een match om de uitslag in te voeren, bv. als een match op papier gespeeld werd of vergeten was.

**Na de avond:** op de publieke uitslag (en bij *Correcties*) staat **Deel de uitslag**: een afbeelding van 1080×1080 met het podium en de opvallendste prestaties, klaar voor Facebook, Instagram of WhatsApp. Op een gsm deel je ze rechtstreeks, anders download je ze.

**Een fout ingevoerde score?** Tik op de match (bij Borden, Matchen, Poules of A/B-schema) en kies **Uitslag corrigeren**. Alle correcties worden bijgehouden in een audit-log.

**Online inschrijven:** op de startpagina staat bij de volgende speelavond de knop **Schrijf je in**. Deel gerust die pagina (bv. in de WhatsApp-groep of op Facebook). Spelers zoeken hun naam of kiezen *Ik ben nieuw*; inschrijven kan tot het sluitingsuur op de dag zelf. Betalen en je aanwezig melden blijft ter plaatse.

**TV-scherm:** open op de tv (of een laptop aan de tv) de browser op het adres van de site met `/tv` erachter, bv. `https://…netlify.app/tv`, en tik op **Volledig scherm**. Het scherm blijft aan en wisselt om de 15 seconden. Wil je één scherm vast tonen, gebruik dan bv. `/tv?toon=borden` (of `schema`, `highlights`, `ranking`, `volgende`, `winnaars`).

**Geen wifi?** Werk gewoon verder. Bovenaan staat dan bv. "2 wachten op verbinding". Zodra er weer netwerk is, wordt alles automatisch verstuurd. Sluit de app gerust tussendoor: er gaat niets verloren.

---

## 2. Eenmalige installatie

Je hebt drie gratis accounts nodig: **GitHub** (de code), **Supabase** (de database) en **Netlify** (de website).

### 2.1 Supabase (database)

1. Maak een account op [supabase.com](https://supabase.com) en klik op **New project**. Kies als regio *West EU (Ireland)* of *Central EU (Frankfurt)* en bewaar het databasewachtwoord goed.
2. **Database opzetten.** Kies één van deze twee manieren, nooit beide:
   - **A. Automatisch via GitHub (zo is het nu ingesteld).** Ga in Supabase naar **Project Settings → Integrations → GitHub**, koppel deze repository en zet:
     - *Supabase directory* (werkmap) op `.`;
     - **Deploy to production** aan, met `main` als productiebranch.

     Bij elke merge naar `main` past Supabase dan zelf de nieuwe bestanden uit [`supabase/migrations`](supabase/migrations) toe op je database. Controleer na de eerste merge in de **Table Editor** of de tabellen (`players`, `matches`, …) er staan. Lukte het niet, dan zie je de fout bij de GitHub-integratie in Supabase. Tip: maak de Supabase-check in GitHub verplicht (*Settings → Branches → Branch protection*), zodat een kapotte migratie niet gemerged kan worden.
   - **B. Met de hand.** Open **SQL Editor → New query**, plak de volledige inhoud van [`supabase/setup.sql`](supabase/setup.sql) en klik op **Run**. Je zou "Success. No rows returned" moeten zien. Zet in dat geval *Deploy to production* uit, anders probeert Supabase dezelfde tabellen nog eens aan te maken.
3. Ga naar **Authentication → Sign In / Providers → Email**:
   - laat **Enable email provider** en **Allow new users to sign up** aan staan;
   - zet **Confirm email** **uit** (de gratis mailservice van Supabase stuurt enkel mails naar teamleden van het project).
4. Ga naar **Project Settings → API (API Keys)** en noteer:
   - de **Project URL** (bv. `https://abcd1234.supabase.co`);
   - de **anon / public key** (of *publishable key*). Die mag openbaar zijn; de beveiliging zit in de database zelf.
   - Gebruik **nooit** de *service_role* of *secret key* in de app.

### 2.2 Netlify (website)

1. Maak een account op [netlify.com](https://netlify.com) en kies **Add new site → Import an existing project → GitHub** en selecteer deze repository.
2. De instellingen worden automatisch gelezen uit `netlify.toml` (build: `npm run build`, map: `dist`).
3. Ga naar **Site configuration → Environment variables** en voeg toe:
   - `VITE_SUPABASE_URL` = de Project URL van hierboven
   - `VITE_SUPABASE_ANON_KEY` = de anon/public key
4. **Deploys → Trigger deploy**. Na een minuut staat de site op `https://<naam>.netlify.app`. Een eigen domein koppelen kan later via *Domain management*; in de code staat nergens een domein.

### 2.3 Eerste account en admins

1. Surf naar `https://<jouw-site>/login → Account aanvragen`. **Het allereerste account wordt automatisch admin.**
2. De andere organisatoren vragen ook een account aan. Jij keurt ze goed via **Beheer → Gebruikers** (rol *Wedstrijdleider* of *Admin*).
3. Maak via **Beheer → Seizoenen & avonden** een seizoen aan, controleer de instellingen (puntentabel, beste X van Y, legs, …) en klik op **Alle derde zaterdagen** om de kalender te vullen.

### 2.4 Supabase wakker houden (belangrijk)

Een gratis Supabase-project wordt **gepauzeerd na 7 dagen zonder activiteit**. In deze repository zit een automatische taak die de database om de 3 dagen even aanroept. Zet ze zo aan:

- GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:
  - `SUPABASE_URL` = de Project URL
  - `SUPABASE_ANON_KEY` = de anon/public key
- Test via **Actions → Supabase wakker houden → Run workflow**.

Toch gepauzeerd? Log in op supabase.com en klik op **Restore project**. Je gegevens blijven bewaard.

---

## 3. Beheer en onderhoud

- **Puntentabel of beste X van Y aanpassen**: Beheer → Seizoenen → seizoen → *Instellingen*. Dit geldt meteen voor de hele seizoensranking.
- **Elo en loting**: in dezelfde instellingen kies je de standaard-seeding (Elo, seizoensranking of willekeurig) en de Elo-instellingen (startwaarde, K-factor, hogere K voor nieuwe spelers). Elo wordt telkens opnieuw berekend uit alle gespeelde matchen; je hoeft niets bij te houden.
- **Klassementen**: de rankingpagina heeft tabbladen voor punten, Elo, 180's, hoogste uitgooi, deelnames en beste nieuwkomer.
- **Dubbele speler**: Beheer → Spelers → speler → *Samenvoegen* (enkel admin).
- **Iemand wil verwijderd worden (GDPR)**: Beheer → Spelers → speler → *Anonimiseren*. De naam wordt "Anonieme speler" en de contactgegevens worden gewist. De uitslagen blijven anoniem bestaan, zodat de ranking klopt.
- **Back-up**: het gratis Supabase-plan maakt geen automatische back-ups. Exporteer na elke speelavond (of minstens maandelijks) de tabellen via Supabase → *Table Editor* → tabel → *Export → CSV*. Een volledige JSON-export in de app komt in fase 2.
- **Demo-data** (om te oefenen): Beheer → Overzicht → **Demo-data laden** (enkel admins). Dat geeft een apart "Demoseizoen" met 25 fictieve spelers, 6 gespeelde avonden en een oefenavond op de dag zelf (score-pin `1234`), zodat je check-in, starten en scores kan uitproberen. Met **Demo-data verwijderen** verdwijnt alles weer; echte seizoenen, avonden en spelers blijven ongemoeid. Zolang de demo-data bestaat, is ze ook op de publieke site zichtbaar. (Alternatief zonder app: plak [`supabase/seed.sql`](supabase/seed.sql) in de SQL Editor en verwijder met [`supabase/demo-cleanup.sql`](supabase/demo-cleanup.sql).)
- **Updates van de app**: elke wijziging op `main` in GitHub wordt automatisch door Netlify gepubliceerd. Nieuwe databasewijzigingen (een nieuw bestand in `supabase/migrations/`) past Supabase zelf toe dankzij *Deploy to production*. Werk je met manier B (met de hand), voer dan **enkel dat nieuwe bestand** uit in de SQL Editor.

---

## 4. Ontwikkelen (voor technische helpers)

Vereisten: Node.js 22.

```bash
npm install
npm run local:supabase -- --seed   # lokale Supabase-nabootsing met demo-data (venster 1)
npm run dev:local                  # app op http://localhost:5173 (venster 2)
```

Of tegen een echt Supabase-project: kopieer `.env.example` naar `.env.local`, vul de waarden in en start `npm run dev`.

```bash
npm run lint && npm run typecheck && npm test   # snelle controles (±1 minuut)
npm run test:e2e                                # volledige avond in een browser
```

De lokale nabootsing (`scripts/local`) draait dezelfde migraties, RLS en functies op PGlite. Realtime wordt niet nagebootst; de app ververst dan elke 30 seconden. Zie [CLAUDE.md](CLAUDE.md) voor de architectuur.

---

## 5. Problemen oplossen

| Probleem | Oplossing |
|---|---|
| De site toont "nog niet gekoppeld" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` ontbreken op Netlify. Voeg ze toe en klik op *Trigger deploy*. |
| "Nieuwe accounts zijn uitgeschakeld" (of "Signups not allowed for this instance") | Supabase → *Authentication → Sign In / Providers* → zet **Allow new users to sign up** aan en klik op *Save*. |
| Inloggen lukt niet na een aanvraag | Een admin moet het account goedkeuren (Beheer → Gebruikers). Staat *Confirm email* nog aan in Supabase? Zet het uit. |
| "Foute pincode" bij de schrijvers | De pin staat rechtsboven op het avondscherm van de wedstrijdleider. Na 20 foute pogingen is het 10 minuten wachten. |
| Een correctie wordt geweigerd | De volgende match in het schema is al gespeeld. Corrigeer eerst die match (of zet ze terug). |
| Een pouleuitslag was fout, maar de KO-schema's zijn al gemaakt | Zolang er nog geen KO-match gespeeld is: Poules → *KO-schema's weer verwijderen*, corrigeer en maak ze opnieuw. |
| Alles is mislopen bij de start | Afsluiten → *Gevarenzone* → *Toernooi terugzetten* (de check-in blijft bewaard). |
| De database reageert niet | Het Supabase-project staat waarschijnlijk op pauze: supabase.com → *Restore project*. |

---

## 6. Wedstrijdregels in de app

- **Poules** van bij voorkeur 4 spelers, anders 5, en 3 enkel als het niet anders kan (6, 7 en 11 spelers). De wedstrijdleider kan ook kiezen voor minder, grotere poules.
- **Poulerangschikking**: gewonnen matchen → legsaldo → gewonnen legs → onderling resultaat → (gemiddelde, later) → barrage of loting. Wie opgeeft, staat onderaan de poule en verliest de resterende matchen met walk-over (maximale legs voor de tegenstander).
- **Doorstroming**: top 2 per poule naar A (instelbaar; bij één poule de top 4), de rest naar B. Byes gaan naar de beste poulewinnaars. Poulegenoten komen elkaar niet tegen in de eerste KO-ronde en zitten in verschillende helften van het A-schema. Poules van verschillende grootte worden vergeleken op winstpercentage, legsaldo per match en gewonnen legs per match.
- **Eindplaatsen**: A-schema eerst (gedeelde plaatsen per ronde: 3–4, 5–8, …), dan het B-schema. Bij een gedeelde plaats krijg je de punten van de hoogste plaats in dat bereik.
- **Ranking**: beste X van Y avonden (op het totaal per avond, deelnamepunten inbegrepen). Bij gelijke stand: aantal overwinningen → beste resultaat → onderling resultaat → gewonnen legs → loting.
- **Planning**: een speler speelt nooit op twee borden tegelijk. Wie net gespeeld heeft, krijgt liefst eerst wat rust. Borden blijven zoveel mogelijk bezet. A en B lopen tegelijk, en de A-finale wordt als laatste op het hoofdbord gespeeld (instelbaar).
