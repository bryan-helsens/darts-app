import { expect, test } from '@playwright/test';
import { ensureDemoData, nextWeek, playAllBoards, signInAsOrganizer } from './helpers';

/**
 * Masters met de demo-data (25 spelers in de ranking): aanzetten in de
 * seizoensinstellingen (8 spelers), een Masters aanmaken, de nummer 3 is er
 * niet en wordt vervangen door de nummer 9, spelen (double elimination) en
 * afsluiten. De seizoensranking blijft ongewijzigd.
 */

const DEMO_SEASON = 'de000000-0000-4000-8002-000000000001';

test('Masters met een vervanger', async ({ page }) => {
  await signInAsOrganizer(page);
  await ensureDemoData(page);

  // De ranking vóór de Masters.
  await page.goto(`/ranking/${DEMO_SEASON}`);
  // Enkel de spelers, niet de Masters-grens (die verschijnt pas als de Masters aanstaat).
  const rankingRows = page.locator('tbody tr:not([data-masters-cut])');
  await expect(rankingRows.first()).toBeVisible();
  const rankingBefore = await rankingRows.allInnerTexts();
  await expect(page.locator('[data-masters-cut]')).toHaveCount(0);

  // De laatste demo-avond werd per beurt gescoord: klassement "Gemiddelde".
  await page.getByRole('button', { name: 'Gemiddelde', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // Masters aanzetten (8 spelers) en aanmaken.
  await page.goto(`/beheer/seizoenen/${DEMO_SEASON}`);
  await expect(page.getByRole('button', { name: '+ Masters' })).toHaveCount(0);
  await page.getByLabel('Een Masters voor de top van de ranking').check();
  await page.getByLabel('Aantal spelers').fill('8');
  await page.getByRole('button', { name: 'Instellingen opslaan' }).click();
  await expect(page.getByText('Opgeslagen.')).toBeVisible();
  await page.getByRole('button', { name: '+ Masters' }).click();
  await page.getByRole('dialog').getByLabel('Datum').fill(nextWeek(4));
  await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  // Hoogstens één Masters per seizoen.
  await expect(page.getByRole('button', { name: '+ Masters' })).toHaveCount(0);
  const mastersRow = page.locator('div', { has: page.getByText('Masters', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Openen' }) }).last();
  await mastersRow.getByRole('button', { name: 'Openen' }).click();

  // Check-in: de ranking, geen zoekveld. De nummer 3 is er niet, de nummer 9 vervangt.
  await expect(page.getByPlaceholder('Zoek of voeg een speler toe…')).toHaveCount(0);
  const rows = page.locator('[data-masters-row]');
  for (const i of [0, 1, 3, 4, 5, 6, 7, 8]) await rows.nth(i).getByRole('button', { name: 'Aanwezig?' }).click();
  await expect(page.locator('[data-masters-count]')).toContainText('8 van 8 plaatsen ingevuld');
  await expect(rows.nth(2)).toContainText('afwezig');
  await expect(rows.nth(8)).toContainText('vervanger');
  await expect(page.getByRole('button', { name: '✓ Alles gesynchroniseerd' })).toBeVisible({ timeout: 15_000 });

  // Starten: standaard double elimination met het veld van 8.
  await page.getByRole('button', { name: 'Starten', exact: true }).click();
  await expect(page.getByText('8 aanwezige spelers')).toBeVisible();
  await expect(page.locator('[data-format="double_elim"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Toernooi starten' }).click();
  await page.getByRole('button', { name: 'Starten en schema loten' }).click();
  await expect(page.getByText('Double elimination').first()).toBeVisible();

  await playAllBoards(page);

  await page.getByRole('button', { name: 'Afsluiten', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  // Geen punten: de Masters telt niet voor de ranking.
  await expect(page.getByRole('columnheader', { name: 'Ptn' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Masters afsluiten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Afsluiten' }).click();
  await expect(page.getByText('Afgelopen').first()).toBeVisible();
  await page.getByRole('button', { name: 'Uitslag', exact: true }).click();
  const winner = (await page.locator('tbody tr').first().locator('td').nth(1).innerText()).trim();

  // De ranking is ongewijzigd; de winnaar heeft een Masters-titel op zijn profiel.
  await page.goto(`/ranking/${DEMO_SEASON}`);
  await expect(rankingRows.first()).toBeVisible();
  expect(await rankingRows.allInnerTexts()).toEqual(rankingBefore);
  // Nu de Masters aanstaat: de grens na de top 8.
  await expect(page.locator('[data-masters-cut]')).toContainText('top 8 voor de Masters');
  await expect(page.locator('tbody tr').nth(8)).toHaveAttribute('data-masters-cut');
  await page.getByRole('link', { name: winner, exact: true }).first().click();
  await expect(page.locator('[data-masters-winner]')).toContainText('Masters-winnaar');
  // Onderlinge duels: openklappen toont de matchen.
  const duels = page.locator('[data-head-to-head]');
  await expect(duels).toBeVisible();
  await duels.locator('tbody tr').first().click();
  await expect(duels.locator('li').first()).toBeVisible();
});
