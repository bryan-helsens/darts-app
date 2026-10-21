import { expect, test } from '@playwright/test';
import { nextWeek, playAllBoards, signInAsOrganizer } from './helpers';

/**
 * Een avond in double elimination met 6 spelers: format kiezen bij de start,
 * alle matchen (winnaars- en verliezersschema, grote finale) via de borden
 * spelen, afsluiten en de eindstand bekijken.
 */

const PLAYERS = ['Wim Aerts', 'Xavier Bostoen', 'Yana Cools', 'Zeno Daems', 'Lotte Eeckhout', 'Mathias Fonteyne'];

test('double elimination met 6 spelers', async ({ page }) => {
  await signInAsOrganizer(page);

  // Een seizoen (bestaand of nieuw) met een avond een week later.
  await page.getByRole('link', { name: 'Seizoenen', exact: true }).click();
  const create = page.getByRole('button', { name: /\+ Seizoen/ });
  if (await create.isEnabled()) await create.click();
  else await page.locator('a[href^="/beheer/seizoenen/"]').first().click();
  await page.getByRole('button', { name: '+ Avond' }).click();
  await page.getByRole('dialog').getByLabel('Datum').fill(nextWeek(1));
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

  // Format kiezen: double elimination → 2n − 2 = 10 matchen, schema van 8 met 2 byes.
  await page.getByRole('button', { name: 'Starten', exact: true }).click();
  await expect(page.getByText('6 aanwezige spelers')).toBeVisible();
  await page.locator('[data-format="double_elim"]').click();
  await expect(page.getByText('2 met een bye')).toBeVisible();
  await expect(page.getByText('10 matchen ·')).toBeVisible();
  await expect(page.getByText('Verliezers vroege rondes', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Toernooi starten' }).click();
  await page.getByRole('button', { name: 'Starten en schema loten' }).click();
  await expect(page.getByText('Double elimination').first()).toBeVisible();

  // Geen poules: wel een schema met winnaars-, verliezersschema en grote finale.
  await expect(page.getByRole('button', { name: 'Poules', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Schema', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Winnaarsschema' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verliezersschema' })).toBeVisible();
  await expect(page.getByText('Verliezersfinale').first()).toBeVisible();

  await playAllBoards(page);

  await page.getByRole('button', { name: 'Afsluiten', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('tbody tr').first()).toContainText('Finale');
  await page.getByRole('button', { name: 'Avond afsluiten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Afsluiten' }).click();
  await expect(page.getByText('Afgelopen').first()).toBeVisible();

  // Publiek: eindstand en schema zonder poules.
  const eventUrl = page.url().replace('/beheer/avond/', '/avond/');
  await page.goto(eventUrl);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Schema', exact: true }).click();
  await expect(page.getByText('Grote finale').first()).toBeVisible();
});
