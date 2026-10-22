import { expect, test, type Page } from '@playwright/test';
import { nextWeek, signInAsOrganizer } from './helpers';

/**
 * 501 per beurt: de schrijver kiest "501 per beurt" en wie begint, tikt de
 * beurten in (met uitgooi-suggestie), herlaadt midden in een leg, speelt de
 * laatste leg zonder verbinding en synchroniseert. In beheer verschijnen de
 * uitslag, de gemiddelden en de beurten.
 */

const PLAYERS = ['Ada Arnouts', 'Bert Boone', 'Cas Coppens', 'Dina Dierckx'];

async function visit(page: Page, score: number) {
  await page.getByRole('button', { name: String(score), exact: true }).click();
}

async function type(page: Page, score: number) {
  for (const digit of String(score)) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

const rest = (page: Page, slot: 1 | 2) => page.locator(`[data-x01-player="${slot}"] [data-x01-rest]`);

test('501 per beurt', async ({ page, browser }) => {
  await signInAsOrganizer(page);

  await page.getByRole('link', { name: 'Seizoenen', exact: true }).click();
  const create = page.getByRole('button', { name: /\+ Seizoen/ });
  if (await create.isEnabled()) await create.click();
  else await page.locator('a[href^="/beheer/seizoenen/"]').first().click();
  await page.getByRole('button', { name: '+ Avond' }).click();
  await page.getByRole('dialog').getByLabel('Datum').fill(nextWeek(2));
  await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Openen' }).last().click();
  for (const name of PLAYERS) {
    await page.getByPlaceholder('Zoek of voeg een speler toe…').fill(name);
    await page.getByRole('button', { name: /Nieuwe speler/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Toevoegen en aanwezig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await expect(page.getByRole('button', { name: '✓ Alles gesynchroniseerd' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Starten', exact: true }).click();
  await page.getByRole('button', { name: 'Toernooi starten' }).click();
  await page.getByRole('button', { name: 'Starten en poules loten' }).click();
  await expect(page.getByText('Verwacht einde')).toBeVisible();
  const pin = (await page.locator('[data-pin]').textContent())?.trim() ?? '';

  // De schrijver kiest per match: snel of 501 per beurt.
  const context = await browser.newContext();
  const scorer = await context.newPage();
  await scorer.goto('/score');
  for (const digit of pin) await scorer.getByRole('button', { name: digit, exact: true }).click();
  await scorer.getByRole('button', { name: 'OK' }).click();
  await scorer.locator('button:has-text("Bord ")').first().click();
  const dialog = scorer.getByRole('dialog');
  await expect(dialog.locator('[data-legs-row="1"]')).toBeVisible();
  await dialog.getByRole('button', { name: '501 per beurt' }).click();
  await dialog.locator('[data-x01-start] button').first().click();

  // Leg 1: speler 1 begint. 180 · 60 · 180 · 60 → 141 over: suggestie, dan uitgooien in 3 darts.
  const board = scorer.getByRole('dialog', { name: '501 per beurt' });
  await expect(board).toBeVisible();
  for (const score of [180, 60, 180, 60]) await visit(scorer, score);
  await expect(rest(scorer, 1)).toHaveText('141');
  await expect(rest(scorer, 2)).toHaveText('381');
  await expect(scorer.locator('[data-x01-route]')).toHaveText('Uitgooi T20 · T19 · D12');
  await type(scorer, 141);
  await expect(scorer.locator('[data-x01-leg-end]')).toContainText('9 darts · gem. 167,00 · uitgooi 141');
  await scorer.getByRole('button', { name: 'Volgende leg' }).click();

  // Leg 2: speler 2 begint. Een bust kan pas onder de 182; ongedaan maken kan.
  await expect(rest(scorer, 1)).toHaveText('501');
  await visit(scorer, 100);
  await visit(scorer, 100);
  await visit(scorer, 26);
  await scorer.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(rest(scorer, 2)).toHaveText('401');

  // Herladen: de lopende leg staat nog op het toestel.
  await scorer.reload();
  await scorer.getByRole('button', { name: /^Verder:/ }).click();
  await expect(rest(scorer, 1)).toHaveText('401');
  await expect(rest(scorer, 2)).toHaveText('401');

  // De rest van de leg zonder verbinding.
  await context.setOffline(true);
  for (const score of [100, 180, 100, 180, 100]) await visit(scorer, score);
  await expect(rest(scorer, 1)).toHaveText('41');
  await type(scorer, 41);
  await expect(scorer.locator('[data-x01-darts]')).toBeVisible();
  await expect(scorer.locator('[data-x01-darts]').getByRole('button', { name: '1', exact: true })).toBeDisabled();
  await scorer.locator('[data-x01-darts]').getByRole('button', { name: '2', exact: true }).click();
  const confirm = scorer.locator('[data-x01-confirm]');
  // Speler 1: 1002 punten in 20 darts; speler 2: 520 in 18.
  await expect(confirm).toContainText('Gemiddelde150,3086,67');
  await confirm.getByRole('button', { name: 'Ja, opslaan' }).click();
  await expect(board).toBeHidden();
  await expect(scorer.getByRole('button', { name: '1 wacht op verbinding' })).toBeVisible();
  await context.setOffline(false);
  await scorer.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(scorer.getByRole('button', { name: '✓ Alles gesynchroniseerd' })).toBeVisible({ timeout: 15_000 });
  await context.close();

  // In beheer: uitslag 2–0, gemiddelden in de poule en per match, de beurten.
  await page.reload();
  await page.getByRole('button', { name: 'Poules', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Gem.' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '150,30' })).toBeVisible();
  await page.getByRole('button', { name: 'Matchen', exact: true }).click();
  await page.getByRole('button', { name: /^Gespeeld/ }).click();
  await page.locator('section button').first().click();
  const modal = page.getByRole('dialog');
  await expect(modal.locator('[data-match-averages]')).toContainText('150,30');
  await expect(modal.locator('[data-match-averages]')).toContainText('86,67');
  await modal.getByRole('button', { name: 'Beurten bekijken' }).click();
  await expect(modal.locator('[data-legs-detail]')).toContainText('Leg 2');
});
