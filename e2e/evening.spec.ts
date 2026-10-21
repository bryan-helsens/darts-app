import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { nextWeek, playAllBoards } from './helpers';

/**
 * Een volledige speelavond door de app heen, zoals een vrijwilliger hem
 * doorloopt: account, seizoen, avond, check-in, starten, alle scores,
 * KO-schema's, afsluiten, ranking. Plus de schrijver met pincode, offline.
 */

const PLAYERS = ['Arne Beke', 'Bram Claes', 'Cindy Dewitte', 'Dries Engels', 'Eva Fierens', 'Frank Goethals', 'Greet Hoste', 'Hans Ide', 'Inge Joos'];
/** Deze speler schrijft zich vooraf online in; de rest wordt ter plaatse toegevoegd. */
const ONLINE = 'Inge Joos';

test('een volledige speelavond', async ({ page, browser }) => {
  // Eerste account wordt admin.
  await page.goto('/login');
  await page.getByRole('button', { name: 'Account aanvragen' }).first().click();
  await page.getByLabel('Je naam').fill('Organisator');
  await page.getByLabel('E-mailadres').fill('org@sanapolis.test');
  await page.getByLabel('Wachtwoord').fill('geheim1234');
  await page.locator('form').getByRole('button', { name: 'Account aanvragen' }).click();
  // Niet zelf navigeren: dat zou de aanvraag afbreken. Het eerste account komt vanzelf in het beheer terecht.
  await expect(page).toHaveURL(/\/beheer$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Beheer' })).toBeVisible();

  // Seizoen en speelavond.
  await page.getByRole('link', { name: 'Seizoenen', exact: true }).click();
  await page.getByRole('button', { name: /\+ Seizoen/ }).click();
  await page.getByRole('button', { name: '+ Avond' }).click();
  await page.getByRole('dialog').getByLabel('Datum').fill(nextWeek());
  await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();

  // Online inschrijven door een bezoeker zonder account (nieuwe speler).
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/');
  // De volgende avond als afspraak in de agenda (.ics).
  const [ics] = await Promise.all([visitor.waitForEvent('download'), visitor.getByRole('button', { name: 'In mijn agenda' }).click()]);
  expect(ics.suggestedFilename()).toMatch(/^sanapolis-darts-\d{4}-\d{2}-\d{2}\.ics$/);
  expect(readFileSync(await ics.path(), 'utf8')).toContain('BEGIN:VEVENT');
  await visitor.getByRole('link', { name: 'Schrijf je in' }).click();
  await visitor.getByRole('button', { name: 'Ik ben nieuw' }).click();
  await visitor.getByLabel('Je naam').fill(ONLINE);
  await visitor.getByRole('button', { name: 'Inschrijven' }).click();
  await expect(visitor.getByText('Je bent ingeschreven')).toBeVisible();
  // Nog niet bevestigd: publiek nog niet zichtbaar.
  await visitor.goto('/spelers');
  await expect(visitor.getByText(ONLINE)).toHaveCount(0);
  await visitorContext.close();

  await page.getByRole('button', { name: 'Openen' }).first().click();

  // De online inschrijving staat in de check-in; aanwezig zetten bevestigt de speler.
  const onlineRow = page.locator('[data-player-row]', { hasText: ONLINE });
  await expect(onlineRow.getByText('nieuw · online')).toBeVisible();
  await onlineRow.getByRole('button', { name: 'Aanwezig?' }).click();

  // Check-in: nieuwe spelers toevoegen (meteen aanwezig) en laten betalen.
  for (const name of PLAYERS.filter((n) => n !== ONLINE)) {
    await page.getByPlaceholder('Zoek of voeg een speler toe…').fill(name);
    await page.getByRole('button', { name: /Nieuwe speler/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Toevoegen en aanwezig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await expect(page.getByRole('button', { name: '✓ Alles gesynchroniseerd' })).toBeVisible({ timeout: 15_000 });
  for (const name of PLAYERS) {
    await page.locator('[data-player-row]', { hasText: name }).getByRole('button', { name: '€5?' }).click();
  }
  await expect(page.getByText('€45')).toBeVisible();

  // Een dubbele naam geeft een waarschuwing.
  await page.getByPlaceholder('Zoek of voeg een speler toe…').fill('Arne Bekke');
  await page.getByRole('button', { name: /Nieuwe speler/ }).click();
  await expect(page.getByText('Bestaat deze speler al?')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Zoek of voeg een speler toe…').fill('');

  // Starten: 9 spelers → poules van 4 en 5, met een geschatte eindtijd.
  await page.getByRole('button', { name: 'Starten', exact: true }).click();
  await expect(page.getByText('9 aanwezige spelers')).toBeVisible();
  await expect(page.getByText('Geschatte eindtijd')).toBeVisible();
  await page.getByRole('button', { name: 'Toernooi starten' }).click();
  await page.getByRole('button', { name: 'Starten en poules loten' }).click();
  await expect(page.getByText('Verwacht einde')).toBeVisible();
  await expect(page.locator('[data-scorer]').first()).toBeVisible();

  // TV-modus toont de borden.
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvContext.newPage();
  await tv.goto('/tv?toon=borden');
  await expect(tv.getByRole('heading', { name: 'Nu op de borden' })).toBeVisible();
  await tvContext.close();

  // De schrijver voert met de pincode een score in, ook zonder verbinding.
  const pin = (await page.locator('[data-pin]').textContent())?.trim() ?? '';
  const scorerContext = await browser.newContext();
  const scorer = await scorerContext.newPage();
  await scorer.goto('/score');
  for (const digit of pin) await scorer.getByRole('button', { name: digit, exact: true }).click();
  await scorer.getByRole('button', { name: 'OK' }).click();
  await expect(scorer.getByText('Tik op jouw bord')).toBeVisible();
  await scorerContext.setOffline(true);
  await enterScoreOffline(scorer);
  await expect(scorer.getByRole('button', { name: '1 wacht op verbinding' })).toBeVisible();
  await scorerContext.setOffline(false);
  await scorer.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(scorer.getByRole('button', { name: '✓ Alles gesynchroniseerd' })).toBeVisible({ timeout: 15_000 });
  await scorerContext.close();

  // Poules uitspelen.
  await page.reload();
  await playAllBoards(page);

  // Barrages loten (als die er zijn) en KO-schema's maken.
  await page.getByRole('button', { name: 'Poules', exact: true }).click();
  while (await page.getByRole('button', { name: 'Loting' }).count()) {
    await page.getByRole('button', { name: 'Loting' }).first().click();
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: 'A- en B-schema maken' }).click();
  await page.getByRole('button', { name: "Schema's maken" }).click();
  await page.getByRole('button', { name: 'A/B-schema' }).click();
  await expect(page.getByText('Halve finale').first()).toBeVisible();

  // KO uitspelen, de A-finale corrigeren (zelfde winnaar, andere score) en afsluiten.
  await playAllBoards(page);
  await page.getByRole('button', { name: 'Matchen', exact: true }).click();
  await page.getByRole('button', { name: /^Gespeeld/ }).click();
  await page.getByRole('button', { name: /^Finale/ }).first().click();
  const fix = page.getByRole('dialog');
  await fix.getByRole('button', { name: 'Uitslag corrigeren' }).click();
  await fix.locator('[data-legs-row="2"] button').nth(1).click();
  await fix.getByRole('button', { name: 'Verder' }).click();
  await fix.getByRole('button', { name: 'Ja, opslaan' }).click();
  await expect(fix).toBeHidden();
  await page.getByRole('button', { name: 'Afsluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Avond afsluiten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Afsluiten' }).click();
  await expect(page.getByText('Afgelopen').first()).toBeVisible();

  // Publiek: ranking met alle 9 spelers, winnaar 27 punten.
  await page.goto('/ranking');
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await expect(page.locator('tbody tr').first()).toContainText('27');

  // Elo-klassement: alle 9 spelers hebben nu een rating.
  await page.goto('/ranking?klassement=elo');
  await expect(page.locator('tbody tr')).toHaveCount(9);

  // Spelersprofiel: verloop in de ranking en van de Elo.
  await page.goto('/ranking');
  await page.locator('tbody a').first().click();
  await expect(page.getByRole('img', { name: /Plaats in de ranking/ })).toBeVisible();
  await page.getByRole('button', { name: 'Elo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Elo na elke avond' })).toBeVisible();

  // Deelbare uitslag: een PNG van de avond.
  await page.goto('/');
  await page.getByRole('link', { name: 'Volledige uitslag' }).click();
  await page.getByRole('button', { name: 'Deel de uitslag' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Downloaden' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^sanapolis-darts-\d{4}-\d{2}-\d{2}\.png$/);

  // Logboek: de correctie staat erin, ook met de filter op uitslagen.
  await page.goto('/beheer/logboek');
  await expect(page.getByText(/gecorrigeerd: \d–0 → \d–1/)).toBeVisible();
  await page.getByRole('button', { name: 'Uitslagen', exact: true }).click();
  await expect(page.getByText(/gecorrigeerd: \d–0 → \d–1/)).toBeVisible();
  await expect(page.getByText(/schreef zich online in/)).toHaveCount(0);

  // Export: ranking als CSV (BOM, kop + 9 spelers) en de volledige back-up.
  await page.goto('/beheer/seizoenen');
  await page.locator('a[href^="/beheer/seizoenen/"]').first().click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Ranking (CSV)' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^sanapolis-ranking-.+\.csv$/);
  const lines = readFileSync(await csv.path(), 'utf8').trimEnd().split('\r\n');
  expect(lines[0]).toBe('\uFEFFPositie;Speler;Punten;Totaal (alle avonden);Avonden;Avondzeges;Beste plaats;Gewonnen legs;Gelijk na loting');
  expect(lines).toHaveLength(10);
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Volledige back-up (JSON)' }).click()]);
  const backup = JSON.parse(readFileSync(await json.path(), 'utf8')) as { players: unknown[]; event_results: unknown[]; player_contacts: unknown[] };
  expect(backup.players).toHaveLength(9);
  expect(backup.event_results).toHaveLength(9);
  expect(Array.isArray(backup.player_contacts)).toBe(true);
});

async function enterScoreOffline(scorer: Page) {
  const card = scorer.locator('button:has-text("Bord 1")').first();
  await card.click();
  const dialog = scorer.getByRole('dialog');
  await dialog.locator('[data-legs-row="1"] button').last().click();
  await dialog.locator('[data-legs-row="2"] button').nth(1).click();
  await dialog.getByRole('button', { name: 'Verder' }).click();
  await dialog.getByRole('button', { name: 'Ja, opslaan' }).click();
}
