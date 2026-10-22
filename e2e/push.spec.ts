import { expect, test } from '@playwright/test';
import { ensureDemoData, signInAsOrganizer } from './helpers';

/**
 * Pushmeldingen aanzetten op het spelersprofiel. De dev-server heeft geen
 * service worker en de browser geen echte pushdienst: die nabootsen we in de
 * pagina (toestemming en abonnement overleven herladen via localStorage).
 * Het abonnement zelf gaat wel echt naar de database (subscribe_push).
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const ENDPOINT = 'https://push.example/e2e-toestel';
    const makeSub = () => ({
      endpoint: ENDPOINT,
      toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'BPubliekeSleutelVanHetToestel', auth: 'geheimpje' } }),
      unsubscribe: async () => {
        localStorage.removeItem('e2e-push-sub');
        return true;
      },
    });
    const pushManager = {
      getSubscription: async () => (localStorage.getItem('e2e-push-sub') ? makeSub() : null),
      subscribe: async () => {
        localStorage.setItem('e2e-push-sub', '1');
        return makeSub();
      },
    };
    Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve({ pushManager }) });
    Object.defineProperty(Notification, 'permission', { get: () => localStorage.getItem('e2e-push-permission') ?? 'default' });
    Notification.requestPermission = async () => {
      localStorage.setItem('e2e-push-permission', 'granted');
      return 'granted';
    };
  });
});

test('meldingen aanzetten, aanpassen, doorgeven en uitzetten', async ({ page }) => {
  await signInAsOrganizer(page);
  await ensureDemoData(page);

  // Twee spelers uit de lijst.
  await page.goto('/spelers');
  const links = page.locator('a[href^="/spelers/"]');
  await expect(links.nth(1)).toBeVisible();
  const [first, second] = await Promise.all([links.nth(0), links.nth(1)].map(async (l) => ({ href: (await l.getAttribute('href')) as string })));

  await page.goto(first.href);
  const firstName = (await page.locator('h1').innerText()).trim();
  const card = page.locator('[data-push-card]');
  await expect(card).toContainText(`Ben jij ${firstName}?`);
  await card.getByRole('button', { name: 'Meldingen aanzetten' }).click();
  await expect(card).toContainText('Staan aan op dit toestel');
  const reminder = card.getByLabel('Herinnering op de dag van een speelavond');
  await expect(card.getByRole('checkbox')).toHaveCount(4);
  await expect(reminder).toBeChecked();

  // Eén soort uitzetten: bewaard in de database (ook na herladen).
  await reminder.uncheck();
  await expect(reminder).not.toBeChecked();
  await expect(reminder).toBeEnabled();
  await page.reload();
  await expect(card.getByLabel('Herinnering op de dag van een speelavond')).not.toBeChecked();
  await expect(card.getByLabel('Mijn match begint (met het bord)')).toBeChecked();

  // Op een ander profiel: dit toestel hoort bij de eerste speler; doorgeven houdt de keuze.
  await page.goto(second.href);
  const secondName = (await page.locator('h1').innerText()).trim();
  await expect(card).toContainText(`Dit toestel krijgt meldingen voor ${firstName}`);
  await card.getByRole('button', { name: `Meldingen voor ${secondName}` }).click();
  await expect(card).toContainText('Staan aan op dit toestel');
  await expect(card.getByLabel('Herinnering op de dag van een speelavond')).not.toBeChecked();

  // Uitzetten.
  await card.getByRole('button', { name: 'Meldingen uitzetten' }).click();
  await expect(card.getByRole('button', { name: 'Meldingen aanzetten' })).toBeVisible();
  await page.goto(first.href);
  await expect(card).toContainText(`Ben jij ${firstName}?`);

  // Uitleg op de pagina "Nieuw?".
  await page.goto('/nieuw');
  await expect(page.getByText('Meldingen op je gsm')).toBeVisible();
});
