# Sanapolis Darts 🎯

Webapp voor het maandelijkse dartstoernooi in **Brasserie 't Oud Sanatorium** (Sijsele), elke derde zaterdag van de maand.

- **Voor iedereen** (geen login): kalender met de volgende speelavond, **vooraf online inschrijven**, live schema tijdens de avond, uitslagen, seizoensranking, spelersprofielen, reglement en "Nieuw? Zo werkt het".
- **Voor de tv in de zaal** (`/tv`): schermvullend en donker; wisselt automatisch tussen de borden, het schema, de highlights en de ranking.
- **Voor de wedstrijdleider** (op de gsm): check-in en betalingen, toernooi starten met een geschatte eindtijd, borden en wachtrij, scores, A- en B-schema, avond afsluiten.
- **Voor de schrijvers aan het bord**: scores invoeren met een pincode, ook als de wifi even wegvalt: snel (enkel de legs) of **501 per beurt** met gemiddelden en uitgooi-suggesties.
- **Voor de admins**: spelers, seizoenen (puntentabel, beste X van Y, legs per ronde), speelavonden, de **Masters** (eindejaarsfinale) en gebruikers.

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

**501 per beurt (optioneel):** in plaats van enkel de legs kan de schrijver elke beurt intikken. Na het tikken op het bord kiest hij bovenaan **501 per beurt** en wie begint (na de bull-off). Dan tikt hij per beurt de gegooide punten in (snelknoppen 26 tot 180, of het cijferklavier en **OK**). De app:
- telt af, wisselt de spelers en toont bij 170 of minder een **uitgooi-suggestie** (bv. *T20 · T19 · D12*);
- herkent een **bust** vanzelf (te veel, 1 over); de knop **Bust** is voor wie het meteen wil noteren;
- vraagt bij een uitgooi **in hoeveel darts** (enkel als dat niet vastligt), en toont na elke leg de stand met het gemiddelde;
- maakt een vergissing in de lopende leg ongedaan met ↶. Een afgesloten leg corrigeer je achteraf als wedstrijdleider (*Uitslag corrigeren*; de beurten van die match verdwijnen dan).

De gsm bewaart de lopende match zelf: herladen, de batterij of geen wifi kosten niets (*Verder: …* bovenaan `/score`). Na elke leg gaat de stand naar de server (live te zien in rood bij de borden en op de tv), bij de laatste leg ook de uitslag met de gemiddelden, 180's en hoogste uitgooi. Wordt een match al op een ander toestel per beurt gescoord, dan krijgt een tweede toestel een melding; valt een toestel uit, dan kies je als wedstrijdleider bij die match **Lopende beurten wissen**. De standaard (snel of 501 per beurt) en of het **gemiddelde als tiebreak** in de poules telt, stel je in bij de seizoensinstellingen. De schrijver kan per match altijd zelf kiezen. Als wedstrijdleider kom je via een match op **Per beurt scoren (501)** in hetzelfde scherm.

**Masters (eindejaarsfinale, optioneel):** zet in de seizoensinstellingen **Masters** aan en kies het aantal spelers (standaard 16). Bij de speelavonden verschijnt dan **+ Masters** (hoogstens één per seizoen). Een Masters:
- is voor de **top van de seizoensranking**. Online inschrijven kan niet. Bij de **check-in** zie je de ranking: de geplaatsten bovenaan, de reserves eronder. Zet aanwezig wie er is. Is een geplaatste speler er niet, zet dan de eerstvolgende reserve aanwezig: de app vult het veld aan volgens de ranking (*vervanger*) en toont "8 van 8 plaatsen ingevuld";
- start standaard in **double elimination** met seeding op de ranking (beide kan je wijzigen);
- sluit je af met **Masters afsluiten**: de eindplaatsen worden bewaard, maar er zijn **geen seizoenspunten**. De Masters telt niet mee voor de ranking, de klassementen of de exports, **wel voor Elo** (het zijn echte matchen);
- krijgt overal het label *Masters* (kalender, uitslagen, tv, agenda) en de winnaar een titel *Masters-winnaar* op het spelersprofiel.

**Een score achteraf invoeren?** Het tabblad **Matchen** toont alle matchen van de avond (te spelen, gespeeld of alle), met een zoekveld. Tik op een match om de uitslag in te voeren, bv. als een match op papier gespeeld werd of vergeten was.

**Na de avond:** op de publieke uitslag (en bij *Correcties*) staat **Deel de uitslag**: een afbeelding van 1080×1080 met het podium en de opvallendste prestaties, klaar voor Facebook, Instagram of WhatsApp. Op een gsm deel je ze rechtstreeks, anders download je ze.

**Een fout ingevoerde score?** Tik op de match (bij Borden, Matchen, Poules of A/B-schema) en kies **Uitslag corrigeren**. Alle correcties worden bijgehouden in het **logboek** (Beheer → Overzicht → Logboek, enkel voor admins).

**Online inschrijven:** op de startpagina staat bij de volgende speelavond de knop **Schrijf je in**. Deel gerust die pagina (bv. in de WhatsApp-groep of op Facebook). Spelers zoeken hun naam of kiezen *Ik ben nieuw*; inschrijven kan tot het sluitingsuur op de dag zelf. Betalen en je aanwezig melden blijft ter plaatse.

**TV-scherm:** open op de tv (of een laptop aan de tv) de browser op het adres van de site met `/tv` erachter, bv. `https://…netlify.app/tv`, en tik op **Volledig scherm**. Het scherm blijft aan en wisselt om de 15 seconden. Wil je één scherm vast tonen, gebruik dan bv. `/tv?toon=borden` (of `schema`, `highlights`, `ranking`, `volgende`, `winnaars`).

**Als app op je gsm:** open de site en kies op Android **Installeren** (kaartje op het beheeroverzicht en op `/score`), of op een iPhone in Safari **Deel → Zet op beginscherm**. De app opent dan zonder adresbalk, start sneller en werkt ook met slechte wifi. Is er een nieuwe versie, dan verschijnt onderaan **Nieuwe versie beschikbaar → Vernieuwen**. Ze herlaadt nooit vanzelf midden in een scoreinvoer. Enkel het TV-scherm werkt zichzelf bij.

**In de agenda:** bij de volgende speelavond staat **In mijn agenda** (een .ics-bestand voor Google, Apple of Outlook). Op de pagina **Nieuw? → Alle speelavonden in je agenda** kunnen spelers zich **abonneren**: nieuwe of verplaatste avonden komen dan vanzelf in hun agenda (adres `https://<jouw-site>/kalender.ics`).

**Grafieken:** op het spelersprofiel staat het **verloop**: de plaats in de ranking na elke avond, de Elo en (als er per beurt gescoord werd) het gemiddelde per avond.

**Onderlinge duels:** op elk spelersprofiel staat per tegenstander hoe vaak je won en verloor (en de legs). Tik op een tegenstander voor alle matchen tegen die speler.

**501-statistieken per seizoen:** wie per beurt scoort, krijgt op het spelersprofiel een blok *501 per beurt* (gemiddelde, eerste 9, beste leg, hoogste uitgooi, 100+, 140+, 180's) en op de rankingpagina staat het klassement **Gemiddelde**.

**Masters-tussenstand:** staat de Masters aan, dan toont de ranking (en de tv) een lijn onder de top 16: wie erboven staat, plaatst zich.

**Gemiddelden:** bij matchen die per beurt gescoord werden, toont de app het 3-dart gemiddelde (punten per drie darts): in de poulestand (kolom *Gem.*), bij de match (met **Beurten bekijken**), op de publieke uitslag (*Gemiddelden van de avond*), op de tv en in de matchen-CSV.

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
5. De abonneerbare kalender (`/kalender.ics`) is een kleine Netlify-functie (`netlify/functions/kalender.mts`). Ze gebruikt dezelfde twee variabelen; je hoeft niets extra in te stellen. Na een wijziging aan de variabelen: opnieuw deployen.

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
- **Masters**: in dezelfde instellingen zet je de eindejaarsfinale aan en kies je het aantal spelers (4 tot 32).
- **Scores invoeren**: in dezelfde instellingen kies je de standaard voor de schrijvers (*Snel* of *501 per beurt*) en of het gemiddelde een gelijke poulestand beslist. Dat wordt bij de start van een avond vastgelegd.
- **Elo en loting**: in dezelfde instellingen kies je de standaard-seeding (Elo, seizoensranking of willekeurig) en de Elo-instellingen (startwaarde, K-factor, hogere K voor nieuwe spelers). Elo wordt telkens opnieuw berekend uit alle gespeelde matchen; je hoeft niets bij te houden.
- **Klassementen**: de rankingpagina heeft tabbladen voor punten, Elo, 180's, hoogste uitgooi, deelnames en beste nieuwkomer.
- **Dubbele speler**: Beheer → Spelers → speler → *Samenvoegen* (enkel admin).
- **Iemand wil verwijderd worden (GDPR)**: Beheer → Spelers → speler → *Anonimiseren*. De naam wordt "Anonieme speler" en de contactgegevens worden gewist. De uitslagen blijven anoniem bestaan, zodat de ranking klopt.
- **Logboek** (enkel admins): Beheer → Overzicht → *Logboek* (op een computer ook in de menubalk). Elke ingevoerde of gecorrigeerde uitslag, inschrijving, check-in, betaling, nieuwe speler en wijziging aan een seizoen of avond, in gewone zinnen, met wie en wanneer. Filter per soort of zoek op een naam.
- **Exporteren**: Beheer → Seizoenen → seizoen → *Exporteren*. **Ranking**, **Uitslagen per avond** en **Matchen** als CSV openen meteen in Excel (Belgische instellingen: `;` en komma's). Handig voor een prijsuitreiking of eigen statistieken.
- **Back-up**: het gratis Supabase-plan maakt geen automatische back-ups. Download daarom na elke speelavond (of minstens maandelijks) de **Volledige back-up (JSON)** via *Exporteren* (enkel admins) en bewaar het bestand op een veilige plek (bv. een privé-map in OneDrive of Google Drive): het bevat ook e-mailadressen en telefoonnummers.
  - **Terugzetten** (bv. als een avond per ongeluk verwijderd werd): open Supabase → *SQL Editor* → *New query*, plak de inhoud van [`supabase/restore-backup.sql`](supabase/restore-backup.sql), vervang de regel `PLAK HIER DE BACK-UP` door de volledige inhoud van het back-upbestand en klik op **Run**. Wat al bestaat, blijft ongemoeid: enkel ontbrekende avonden (met alle matchen, uitslagen en inschrijvingen), spelers en contactgegevens worden teruggezet. Je kan het dus zonder risico opnieuw uitvoeren.
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
- **Poulerangschikking**: gewonnen matchen → legsaldo → gewonnen legs → onderling resultaat → 3-dart gemiddelde (instelbaar; enkel als alle poulematchen van de gelijk staande spelers per beurt gescoord werden) → barrage of loting. Wie opgeeft, staat onderaan de poule en verliest de resterende matchen met walk-over (maximale legs voor de tegenstander).
- **Doorstroming**: top 2 per poule naar A (instelbaar; bij één poule de top 4), de rest naar B. Byes gaan naar de beste poulewinnaars. Poulegenoten komen elkaar niet tegen in de eerste KO-ronde en zitten in verschillende helften van het A-schema. Poules van verschillende grootte worden vergeleken op winstpercentage, legsaldo per match en gewonnen legs per match.
- **Eindplaatsen**: A-schema eerst (gedeelde plaatsen per ronde: 3–4, 5–8, …), dan het B-schema. Bij een gedeelde plaats krijg je de punten van de hoogste plaats in dat bereik.
- **Ranking**: beste X van Y avonden (op het totaal per avond, deelnamepunten inbegrepen). Bij gelijke stand: aantal overwinningen → beste resultaat → onderling resultaat → gewonnen legs → loting.
- **Planning**: een speler speelt nooit op twee borden tegelijk. Wie net gespeeld heeft, krijgt liefst eerst wat rust. Borden blijven zoveel mogelijk bezet. A en B lopen tegelijk, en de A-finale wordt als laatste op het hoofdbord gespeeld (instelbaar).

### Formats

Bij **Starten** kies je het format van de avond. Elk format toont meteen een geschatte eindtijd.

- **Poules + A/B-schema** (standaard): zoals hierboven.
- **Double elimination**: geen poules. Wie twee keer verliest, ligt eruit.
  - Iedereen begint in het **winnaarsschema**. Wie daar verliest, gaat naar het **verliezersschema**.
  - De winnaars van beide schema's spelen **één grote finale**, zonder herkansing.
  - Iedereen speelt minstens 2 matchen. In totaal zijn er 2 × spelers − 2 matchen.
  - Byes gaan naar de topseeds.
  - Plaatsen: winnaar en verliezer van de grote finale, dan de verliezer van de verliezersfinale, dan per ronde van het verliezersschema (gedeeld).
  - Legs: de A-legs gelden voor het winnaarsschema en de grote finale, de B-legs voor het verliezersschema.
  - Met meer dan 32 spelers duurt dit erg lang.
- **Knock-out met plate**: een gewoon knock-outschema (**hoofdschema**) met een **plate** (troostschema).
  - Zijn er byes, dan gaan alle verliezers van ronde 1 én ronde 2 naar de plate, ook wie in ronde 1 een bye had. Anders enkel de verliezers van ronde 1.
  - Zo speelt iedereen minstens 2 matchen.
  - In de plate krijgen de verliezers van ronde 2 eerst de byes. Niemand treft in zijn eerste plate-match de speler die hem net uitschakelde, behalve bij 5 spelers, waar dat niet anders kan.
  - Plaatsen: eerst het hoofdschema, dan de plate.
  - Legs: A voor het hoofdschema, B voor de plate.

De seeding (Elo, ranking of willekeurig) werkt bij elk format. Barrages bestaan enkel bij poules. **Toernooi terugzetten** zet het format terug op poules + A/B.
