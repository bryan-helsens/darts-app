import { expect, type Page } from '@playwright/test';

/** Datum binnen een week, zodat de online inschrijving zeker nog open is. */
export function nextWeek(extraDays = 0): string {
  const d = new Date(Date.now() + (7 + extraDays) * 24 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export async function enterScore(page: Page, card: ReturnType<Page['locator']>) {
  await card.click();
  const dialog = page.getByRole('dialog');
  // Speler 1 wint met het maximum, speler 2 krijgt 0 legs.
  await dialog.locator('[data-legs-row="1"] button').last().click();
  await dialog.locator('[data-legs-row="2"] button').first().click();
  await dialog.getByRole('button', { name: 'Verder' }).click();
  await dialog.getByRole('button', { name: 'Ja, opslaan' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: '✓ Alles gesynchroniseerd' })).toBeVisible({ timeout: 15_000 });
}

/** Speelt alle matchen die op de borden komen tot er niets meer klaarstaat. */
export async function playAllBoards(page: Page) {
  for (let i = 0; i < 60; i++) {
    await page.getByRole('button', { name: 'Borden', exact: true }).click();
    const card = page.locator('[role=button]:has-text("Bord ")').first();
    try {
      await card.waitFor({ timeout: 4000 });
    } catch {
      return;
    }
    await enterScore(page, card);
  }
  throw new Error('Te veel matchen');
}


/** Aanmelden als organisator; bestaat het account nog niet, dan aanvragen (het eerste account wordt admin). */
export async function signInAsOrganizer(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill('org@sanapolis.test');
  await page.getByLabel('Wachtwoord').fill('geheim1234');
  await page.locator('form').getByRole('button', { name: 'Inloggen' }).click();
  try {
    await expect(page).toHaveURL(/\/beheer$/, { timeout: 5_000 });
    return;
  } catch {
    // Nog geen account: aanvragen.
  }
  await page.goto('/login');
  await page.getByRole('button', { name: 'Account aanvragen' }).first().click();
  await page.getByLabel('Je naam').fill('Organisator');
  await page.getByLabel('E-mailadres').fill('org@sanapolis.test');
  await page.getByLabel('Wachtwoord').fill('geheim1234');
  await page.locator('form').getByRole('button', { name: 'Account aanvragen' }).click();
  await expect(page).toHaveURL(/\/beheer$/, { timeout: 15_000 });
}

/** Demo-data laden (als organisator op /beheer), tenzij ze er al is. */
export async function ensureDemoData(page: Page) {
  await expect(page.getByRole('button', { name: /^Demo-data (laden|verwijderen)$/ })).toBeVisible({ timeout: 15_000 });
  const load = page.getByRole('button', { name: 'Demo-data laden' });
  if (await load.isVisible()) {
    await load.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Laden' }).click();
    await expect(page.getByRole('button', { name: 'Demo-data verwijderen' })).toBeVisible({ timeout: 30_000 });
  }
}
