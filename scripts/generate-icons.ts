/**
 * App-iconen (PNG) maken uit public/favicon.svg, voor de installeerbare app:
 * 192 en 512 px, een "maskable" variant (Android knipt die bij in een cirkel
 * of afgeronde rechthoek) en een apple-touch-icon voor de iPhone.
 *
 * Eenmalig uitvoeren na een wijziging aan het logo: `npx tsx scripts/generate-icons.ts`.
 * De PNG's worden mee in git bewaard.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const PUBLIC = join(import.meta.dirname, '../public');
const INK = '#0a0a0b';
const svg = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');

interface IconSpec {
  file: string;
  size: number;
  /** Achtergrond (null = doorzichtig). */
  background: string | null;
  /** Deel van de breedte dat het dartbord inneemt. */
  scale: number;
}

const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, background: null, scale: 1 },
  { file: 'icon-512.png', size: 512, background: null, scale: 1 },
  // Maskable: alles binnen de veilige zone (de middelste 80%), op een volle achtergrond.
  { file: 'icon-maskable-512.png', size: 512, background: INK, scale: 0.72 },
  // iOS vult doorzichtige pixels met zwart en rondt zelf de hoeken af.
  { file: 'apple-touch-icon.png', size: 180, background: INK, scale: 0.86 },
];

const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    const inner = Math.round(icon.size * icon.scale);
    await page.setContent(
      `<html><body style="margin:0;width:${icon.size}px;height:${icon.size}px;display:flex;align-items:center;justify-content:center;background:${icon.background ?? 'transparent'}">
        <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
      </body></html>`,
    );
    await page.screenshot({ path: join(PUBLIC, icon.file), omitBackground: icon.background === null });
    await page.close();
    console.log(`${icon.file} (${icon.size}×${icon.size})`);
  }
} finally {
  await browser.close();
}
