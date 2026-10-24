/**
 * High-DPI Canvas 2D multi-page PNG card generator.
 * Ported from legacy `CC.exportPng` & `CC.roundedRect` in legacy/index.html L1285-L1368.
 */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLine(ctx: CanvasRenderingContext2D, str: string, maxW: number): string[] {
  const chars = Array.from(str);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    const test = cur + chars[i];
    if (ctx.measureText(test).width > maxW && cur.length > 0) {
      out.push(cur);
      cur = chars[i];
    } else {
      cur = test;
    }
  }
  if (cur.length) out.push(cur);
  return out.length ? out : [''];
}

export function exportPngCard(
  text: string,
  name: string,
  subtitle = 'CHARACTER SHEET'
): { pages: number } {
  const DPR = 2;
  const CV_W = 720;
  const PAD_X = 56;
  const CONTENT_W = CV_W - PAD_X * 2;
  const FF = '"PingFang SC","Microsoft YaHei",-apple-system,BlinkMacSystemFont,sans-serif';
  const F_BODY = '15px ' + FF;
  const F_TITLE = 'bold 22px ' + FF;
  const F_FOOT = '12px ' + FF;
  const LINE_H = 28;
  const HEADER_H = 200;
  const FOOTER_H = 60;
  const MAX_H = 3900;

  const rawLines = text
    .split('\n')
    .filter((l) => l.trim())
    .filter((l) => !/^[【#]/.test(l));

  const mCv = document.createElement('canvas');
  const mctx = mCv.getContext('2d');
  if (!mctx) return { pages: 0 };
  mctx.font = F_BODY;

  const finalLines: string[] = [];
  rawLines.forEach((line) => {
    wrapLine(mctx, line, CONTENT_W).forEach((w) => finalLines.push(w));
  });
  if (!finalLines.length) return { pages: 0 };

  const perPage = Math.max(1, Math.floor((MAX_H - HEADER_H - FOOTER_H) / LINE_H));
  const pages: string[][] = [];
  for (let i = 0; i < finalLines.length; i += perPage) {
    pages.push(finalLines.slice(i, i + perPage));
  }
  const total = pages.length;

  pages.forEach((pageLines, pi) => {
    const bodyH = pageLines.length * LINE_H;
    const CV_H = Math.max(1080, HEADER_H + bodyH + FOOTER_H);
    const cv = document.createElement('canvas');
    cv.width = CV_W * DPR;
    cv.height = CV_H * DPR;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(DPR, DPR);
    ctx.textBaseline = 'top';

    const bg = ctx.createLinearGradient(0, 0, CV_W, CV_H);
    bg.addColorStop(0, '#eef0ff');
    bg.addColorStop(1, '#fce7f3');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CV_W, CV_H);

    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, 32, 32, CV_W - 64, CV_H - 64, 24);
    ctx.fill();

    ctx.fillStyle = '#6366f1';
    ctx.font = F_TITLE;
    ctx.fillText(subtitle || 'CHARACTER SHEET', PAD_X, 92);

    ctx.fillStyle = '#1f2233';
    let ns = 46;
    ctx.font = `bold ${ns}px ${FF}`;
    const dn = (name || 'Untitled') + (total > 1 ? `（${pi + 1}/${total}）` : '');
    while (ctx.measureText(dn).width > CONTENT_W && ns > 20) {
      ns -= 2;
      ctx.font = `bold ${ns}px ${FF}`;
    }
    ctx.fillText(dn, PAD_X, 130);

    ctx.strokeStyle = '#e8eaf3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD_X, 186);
    ctx.lineTo(CV_W - PAD_X, 186);
    ctx.stroke();

    ctx.font = F_BODY;
    ctx.fillStyle = '#3b3f56';
    let y = HEADER_H;
    for (let i = 0; i < pageLines.length; i++) {
      ctx.fillText(pageLines[i], PAD_X, y);
      y += LINE_H;
    }

    ctx.fillStyle = '#a4abbe';
    ctx.font = F_FOOT;
    ctx.fillText(
      'Worldbuilding Studio v6' + (total > 1 ? ` · 第 ${pi + 1}/${total} 页` : ''),
      PAD_X,
      CV_H - 40
    );

    const a = document.createElement('a');
    a.download = (name || 'card') + (total > 1 ? `-${pi + 1}` : '') + '.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  });

  return { pages: total };
}
