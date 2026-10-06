'use client';

import type { DisplayVerse } from '@/lib/corpus';
import { wrapLines } from '@/lib/wrap';

const W = 1080;
const H = 1350;
const GOLD = '#e9c46a';
const CREAM = '#fbf3e4';

function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function centered(ctx: CanvasRenderingContext2D, lines: string[], y: number, lineHeight: number): number {
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }
  return y;
}

function ornament(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 170, y);
  ctx.lineTo(W / 2 - 22, y);
  ctx.moveTo(W / 2 + 22, y);
  ctx.lineTo(W / 2 + 170, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, y - 12);
  ctx.lineTo(W / 2 + 12, y);
  ctx.lineTo(W / 2, y + 12);
  ctx.lineTo(W / 2 - 12, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A 4:5 image (good for WhatsApp Status and Instagram) with the verse, its meaning, and the site. */
export async function renderShareCard(verse: DisplayVerse): Promise<Blob> {
  const serif = cssFont('--font-serif', 'Georgia, serif');
  const deva = cssFont('--font-devanagari', 'serif');
  await Promise.all([
    document.fonts.load(`48px ${deva}`, verse.sanskrit.slice(0, 20)),
    document.fonts.load(`38px ${serif}`, 'Krishna'),
  ]).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0e1a45');
  sky.addColorStop(1, '#1f3c8c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 230, 20, W / 2, 230, 620);
  glow.addColorStop(0, 'rgba(233, 196, 106, 0.28)');
  glow.addColorStop(1, 'rgba(233, 196, 106, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 1;
  ctx.strokeRect(54, 54, W - 108, H - 108);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GOLD;
  ctx.font = `600 40px ${deva}`;
  ctx.fillText('॥ श्रीमद्भगवद्गीता ॥', W / 2, 150);
  ctx.font = `34px ${serif}`;
  ctx.fillText(`Chapter ${verse.chapter} · Verse ${verse.verse}`, W / 2, 205);

  const textWidth = W - 220;
  const sanskritFont = `500 50px ${deva}`;
  const meaningFont = `40px ${serif}`;
  const sanskritLead = 80;
  const meaningLead = 60;
  const ornamentSpace = 110;

  ctx.font = sanskritFont;
  const sanskrit = verse.sanskrit.replace(/।।\s*\d+\.\d+\s*।।/g, '॥').replace(/\n+/g, '\n');
  const sanskritLines = wrapLines(sanskrit, textWidth, (value) => ctx.measureText(value).width, 8);
  ctx.font = meaningFont;
  const meaning = verse.summary ?? verse.englishTranslation ?? '';
  const meaningLines = wrapLines(meaning, textWidth, (value) => ctx.measureText(value).width, 9);

  // Centre the verse and its meaning between the title and the footer.
  const areaTop = 260;
  const areaBottom = H - 190;
  const blockHeight = sanskritLines.length * sanskritLead + ornamentSpace + meaningLines.length * meaningLead;
  let y = areaTop + Math.max(0, (areaBottom - areaTop - blockHeight) / 2) + 40;

  ctx.fillStyle = CREAM;
  ctx.font = sanskritFont;
  y = centered(ctx, sanskritLines, y, sanskritLead);
  ornament(ctx, y + 10);
  y += ornamentSpace;
  ctx.font = meaningFont;
  centered(ctx, meaningLines, y, meaningLead);

  ctx.fillStyle = GOLD;
  ctx.font = `30px ${serif}`;
  ctx.fillText('Speak with Krishna', W / 2, H - 120);
  ctx.fillStyle = 'rgba(251, 243, 228, 0.7)';
  ctx.font = `26px ${serif}`;
  ctx.fillText(window.location.host, W / 2, H - 80);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png');
  });
}

/** Opens the phone's share sheet when it can take files; otherwise downloads the image. */
export async function shareVerse(verse: DisplayVerse): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderShareCard(verse);
  const name = `gita-${verse.chapter}-${verse.verse}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const text = `Bhagavad Gita ${verse.chapter}.${verse.verse} — ${window.location.origin}`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Bhagavad Gita ${verse.chapter}.${verse.verse}`, text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
