import { expect, test, type Page } from '@playwright/test';

/**
 * Een volledige speelavond door de app heen, zoals een vrijwilliger hem
 * doorloopt: account, seizoen, avond, check-in, starten, alle scores,
 * KO-schema's, afsluiten, ranking. Plus de schrijver met pincode, offline.
 */

const PLAYERS = ['Arne Beke', 'Bram Claes', 'Cindy Dewitte', 'Dries Engels', 'Eva Fierens', 'Frank Goethals', 'Greet Hoste', 'Hans Ide', 'Inge Joos'];

async function enterScore(page: Page, card: ReturnType<Page['locator']>) {
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
async function playAllBoards(page: Page) {
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
  await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();
  await page.getByRole('button', { name: 'Openen' }).first().click();

  // Check-in: nieuwe spelers toevoegen (meteen aanwezig) en laten betalen.
  for (const name of PLAYERS) {
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

  // KO uitspelen en afsluiten.
  await playAllBoards(page);
  await page.getByRole('button', { name: 'Afsluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Avond afsluiten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Afsluiten' }).click();
  await expect(page.getByText('Afgelopen').first()).toBeVisible();

  // Publiek: ranking met alle 9 spelers, winnaar 27 punten.
  await page.goto('/ranking');
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await expect(page.locator('tbody tr').first()).toContainText('27');
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
