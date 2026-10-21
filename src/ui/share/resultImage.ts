/**
 * Deelbare uitslagafbeelding (1080×1080) voor Facebook, Instagram of WhatsApp:
 * het podium en de opvallendste prestaties van een avond, in de huisstijl.
 * `resultImageData` is puur (en getest); `drawResultImage` tekent op een canvas.
 */

import { formatPlace, type Placement } from '../../engine';

export interface ResultImageData {
  /** "zaterdag 21 november 2026" */
  date: string;
  players: number;
  matches: number;
  /** Eerste vier plaatsen (gedeelde plaatsen blijven samen). */
  podium: Array<{ place: string; rank: 1 | 2 | 3; name: string; points: number | null }>;
  most180: { names: string[]; count: number } | null;
  highestFinish: { names: string[]; value: number } | null;
  /** Zonder protocol, bv. "sanapolis-darts.netlify.app". */
  site: string;
}

export interface ResultImageInput {
  date: string;
  placements: readonly Placement[];
  points: ReadonlyMap<string, number>;
  stats: ReadonlyArray<{ player_id: string; count_180: number; highest_finish: number | null }>;
  matchesPlayed: number;
  name: (id: string) => string;
  site: string;
}

export function resultImageData(input: ResultImageInput): ResultImageData {
  const sorted = [...input.placements].sort((a, b) => a.from - b.from || input.name(a.playerId).localeCompare(input.name(b.playerId), 'nl'));
  const podium = sorted
    .filter((p) => p.from <= 3)
    .slice(0, 4)
    .map((p) => ({
      place: formatPlace(p.from, p.to),
      rank: Math.min(p.from, 3) as 1 | 2 | 3,
      name: input.name(p.playerId),
      points: input.points.get(p.playerId) ?? null,
    }));

  const tons = new Map<string, number>();
  const finish = new Map<string, number>();
  for (const s of input.stats) {
    if (s.count_180 > 0) tons.set(s.player_id, (tons.get(s.player_id) ?? 0) + s.count_180);
    if (s.highest_finish !== null) finish.set(s.player_id, Math.max(finish.get(s.player_id) ?? 0, s.highest_finish));
  }
  const best = (m: Map<string, number>) => {
    const max = Math.max(0, ...m.values());
    if (max <= 0) return null;
    const names = [...m].filter(([, v]) => v === max).map(([p]) => input.name(p)).sort((a, b) => a.localeCompare(b, 'nl'));
    return { names, max };
  };
  const t = best(tons);
  const f = best(finish);

  return {
    date: input.date,
    players: input.placements.length,
    matches: input.matchesPlayed,
    podium,
    most180: t ? { names: t.names, count: t.max } : null,
    highestFinish: f && f.max >= 100 ? { names: f.names, value: f.max } : null,
    site: input.site,
  };
}

// ---------------------------------------------------------------------------
// Tekenen
// ---------------------------------------------------------------------------

const SIZE = 1080;
const FONT = "'Inter Variable', Inter, system-ui, sans-serif";
const INK = '#0b0b0d';
const BLUE = '#2563eb';
const RED = '#dc2626';
const MEDAL = { 1: '#fbbf24', 2: '#d4d4d8', 3: '#fdba74' } as const;

/** Tekst die niet breder mag zijn dan `max`: de lettergrootte zakt indien nodig. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, weight: number, size: number, align: CanvasTextAlign = 'left') {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > max && s > 14) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

export async function drawResultImage(canvas: HTMLCanvasElement, data: ResultImageData): Promise<void> {
  await document.fonts?.ready;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Achtergrond: zwart met een zachte blauwe en rode gloed.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (const [x, y, color] of [
    [140, 120, 'rgba(37, 99, 235, 0.35)'],
    [980, 1000, 'rgba(220, 38, 38, 0.28)'],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 620);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  // Dartbord-ringen als decoratie.
  ctx.lineWidth = 2;
  for (const r of [120, 190, 260, 330]) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(SIZE - 60, 80, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Kop
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('Sanapolis', 80, 120);
  const w = ctx.measureText('Sanapolis ').width;
  ctx.fillStyle = RED;
  ctx.fillText('Darts', 80 + w, 120);
  ctx.fillStyle = '#a1a1aa';
  fitText(ctx, data.date, 80, 170, 920, 500, 32);

  ctx.fillStyle = '#ffffff';
  fitText(ctx, 'Uitslag', 80, 270, 920, 800, 92);

  // Podium: 2 – 1 – 3 (bij gedeelde plaatsen naast elkaar)
  const first = data.podium.filter((p) => p.rank === 1);
  const second = data.podium.filter((p) => p.rank === 2);
  const third = data.podium.filter((p) => p.rank === 3);
  const blocks: Array<{ entries: typeof data.podium; x: number; height: number; rank: 1 | 2 | 3 }> = [
    { entries: second, x: 80, height: 190, rank: 2 },
    { entries: first, x: 380, height: 260, rank: 1 },
    { entries: third, x: 680, height: 150, rank: 3 },
  ];
  const base = 770;
  const width = 320;
  for (const b of blocks) {
    if (b.entries.length === 0) continue;
    const top = base - b.height;
    ctx.fillStyle = b.rank === 1 ? BLUE : 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(b.x, top, width - 20, b.height, 18);
    ctx.fill();
    ctx.fillStyle = MEDAL[b.rank];
    ctx.font = `800 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(b.entries[0].place, b.x + (width - 20) / 2, top + 84);
    // Namen boven het blok
    b.entries.forEach((e, i) => {
      const y = top - 26 - (b.entries.length - 1 - i) * 46;
      ctx.fillStyle = '#ffffff';
      fitText(ctx, e.name, b.x + (width - 20) / 2, y, width - 30, 700, b.rank === 1 ? 40 : 34, 'center');
    });
    if (b.entries.length === 1 && b.entries[0].points !== null) {
      ctx.fillStyle = b.rank === 1 ? 'rgba(255,255,255,0.85)' : '#a1a1aa';
      ctx.font = `500 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${b.entries[0].points} punten`, b.x + (width - 20) / 2, top + 128);
    }
  }

  // Highlights
  const items: Array<[string, string]> = [];
  if (data.most180) items.push([`${data.most180.count}× 180`, data.most180.names.join(', ')]);
  if (data.highestFinish) items.push([`Finish ${data.highestFinish.value}`, data.highestFinish.names.join(', ')]);
  items.push([`${data.players} spelers`, `${data.matches} matchen`]);
  const colW = 920 / items.length;
  items.forEach(([big, small], i) => {
    const x = 80 + i * colW;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.roundRect(x, 810, colW - 20, 130, 18);
    ctx.fill();
    ctx.fillStyle = i === items.length - 1 ? '#ffffff' : RED;
    fitText(ctx, big, x + 28, 868, colW - 76, 800, 40);
    ctx.fillStyle = '#d4d4d8';
    fitText(ctx, small, x + 28, 910, colW - 76, 500, 26);
  });

  // Voet
  ctx.fillStyle = '#71717a';
  ctx.font = `500 24px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('Brasserie ’t Oud Sanatorium · Sijsele', 80, 1010);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(data.site, 1000, 1010);
}

/** Canvas → PNG-bestand. */
export function canvasToFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], fileName, { type: 'image/png' })) : reject(new Error('Afbeelding maken lukte niet.'))), 'image/png'),
  );
}
