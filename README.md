# Sanapolis Darts 🎯

Webapp voor het maandelijkse dartstoernooi in **Brasserie 't Oud Sanatorium** (Sijsele), elke derde zaterdag van de maand.

- **Voor iedereen** (geen login): kalender met de volgende speelavond, live schema tijdens de avond, uitslagen, seizoensranking, spelersprofielen, reglement en "Nieuw? Zo werkt het".
- **Voor de wedstrijdleider** (op de gsm): check-in en betalingen, toernooi starten met een geschatte eindtijd, borden en wachtrij, scores, A- en B-schema, avond afsluiten.
- **Voor de schrijvers aan het bord**: scores invoeren met een pincode, ook als de wifi even wegvalt.
- **Voor de admins**: spelers, seizoenen (puntentabel, beste X van Y, legs per ronde), speelavonden en gebruikers.

> Deze README is geschreven voor een opvolger zonder technische achtergrond. Technische details staan in [CLAUDE.md](CLAUDE.md).

---

## 1. Een speelavond in 10 stappen (handleiding wedstrijdleider)

1. **Inloggen** op `/login` met je account. Je blijft ingelogd op je gsm.
2. Ga naar **Beheer → Avond openen**. Bovenaan staat de **score-pin** voor de schrijvers.
3. **Check-in**: zoek elke speler en tik op **Aanwezig?** en **€5?**. Nieuwe speler? Typ de naam en tik op **+ Nieuwe speler**. De app waarschuwt als er al iemand met een gelijkaardige naam bestaat. Bovenaan zie je het aantal aanwezigen, het aantal dat betaald heeft en de prijzenpot.
4. Spelers die vooraf ingeschreven waren maar niet komen, laat je gewoon op "Aanwezig?" staan. Om 18u30 sluit de inschrijving; met **Toch heropenen** kan je nog spelers toevoegen.
5. **Starten**: kies de poule-indeling. Bij elke optie staat de **geschatte eindtijd**. Is die te laat, dan stelt de app aanpassingen voor (bv. poules best of 1). Tik op **Toernooi starten**. De poules worden geloot, met de sterkste spelers (volgens de ranking) in verschillende poules.
6. **Tip:** druk via **afdrukken (PDF)** meteen de poulebladen af. Valt het internet volledig uit, dan kan je op papier verder.
7. **Borden**: hier zie je wat er **nu** op elk bord speelt en wat er **straks** komt. Tik op een bord om de uitslag in te voeren, de match uit te stellen of naar een ander bord te verplaatsen. Een bord erbij of eraf? Kies **Borden: wijzigen**. Geeft iemand op? Kies **Speler geeft op**.
8. De schrijvers openen op hun eigen gsm het adres `/score`, geven de pincode in en tikken op hun bord: **wie won → legs van de verliezer → bevestigen**.
9. Als de poules gespeeld zijn: ga naar **Poules**. Bij een volledig gelijke stand op de grens A/B kies je **Barrage spelen** of **Loting**. Tik dan op **A- en B-schema maken**.
10. Als alles gespeeld is: **Afsluiten → Avond afsluiten**. De eindplaatsen en punten gaan naar de ranking.

**Een fout ingevoerde score?** Tik op de match (bij Borden, Poules of A/B-schema) en kies **Uitslag corrigeren**. Alle correcties worden bijgehouden in een audit-log.

**Geen wifi?** Werk gewoon verder. Bovenaan staat dan bv. "2 wachten op verbinding". Zodra er weer netwerk is, wordt alles automatisch verstuurd. Sluit de app gerust tussendoor: er gaat niets verloren.

---

## 2. Eenmalige installatie

Je hebt drie gratis accounts nodig: **GitHub** (de code), **Supabase** (de database) en **Netlify** (de website).

### 2.1 Supabase (database)

1. Maak een account op [supabase.com](https://supabase.com) en klik op **New project**. Kies als regio *West EU (Ireland)* of *Central EU (Frankfurt)* en bewaar het databasewachtwoord goed.
2. Open in het project **SQL Editor → New query**, plak de volledige inhoud van [`supabase/setup.sql`](supabase/setup.sql) en klik op **Run**. Je zou "Success. No rows returned" moeten zien.
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
- **Dubbele speler**: Beheer → Spelers → speler → *Samenvoegen* (enkel admin).
- **Iemand wil verwijderd worden (GDPR)**: Beheer → Spelers → speler → *Anonimiseren*. De naam wordt "Anonieme speler" en de contactgegevens worden gewist. De uitslagen blijven anoniem bestaan, zodat de ranking klopt.
- **Back-up**: het gratis Supabase-plan maakt geen automatische back-ups. Exporteer na elke speelavond (of minstens maandelijks) de tabellen via Supabase → *Table Editor* → tabel → *Export → CSV*. Een volledige JSON-export in de app komt in fase 2.
- **Demo-data** (om te oefenen): plak [`supabase/seed.sql`](supabase/seed.sql) in de SQL Editor. Dat geeft een demoseizoen met 25 spelers, 6 gespeelde avonden en één geplande avond (pin `1234`). Verwijderen kan met [`supabase/demo-cleanup.sql`](supabase/demo-cleanup.sql). Gebruik hiervoor bij voorkeur een apart testproject.
- **Updates van de app**: elke wijziging op de hoofdbranch in GitHub wordt automatisch door Netlify gepubliceerd. Bevat een update een nieuw bestand in `supabase/migrations/`, voer dan **enkel dat nieuwe bestand** uit in de SQL Editor.

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
| Inloggen lukt niet na een aanvraag | Een admin moet het account goedkeuren (Beheer → Gebruikers). Staat *Confirm email* nog aan in Supabase? Zet het uit. |
| "Foute pincode" bij de schrijvers | De pin staat bovenaan het avondscherm van de wedstrijdleider. Na 20 foute pogingen is het 10 minuten wachten. |
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
