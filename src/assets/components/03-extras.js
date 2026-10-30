
/* Small easing/utility helpers used by the families above. */
function icClamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function icEase(prog) { return 1 - Math.pow(1 - icClamp(prog, 0, 1), 3); }
function icHash(n) {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

function ec2Base(p) {
  const T0 = (typeof T !== 'undefined' && T) ? T : {};
  return ecS(p.background, ecS(p.baseColor, ecS(T0.paper, '#04070F')));
}
function ec2Gon(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const ang = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function ec2Arrow(ctx, x, y, ang, size, color) {
  /* One closed silhouette: shaft, then a full triangular head. No stroke and
     no notch, so no edge can trail outside the arrow at any size. */
  const head = size * 0.95;
  const half = size * 0.62;
  const shaft = size * 0.2;
  const base = size - head;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size, -shaft);
  ctx.lineTo(base, -shaft);
  ctx.lineTo(base, -half);
  ctx.lineTo(size, 0);
  ctx.lineTo(base, half);
  ctx.lineTo(base, shaft);
  ctx.lineTo(-size, shaft);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function ec2InkOn(hex) {
  const v = typeof hex === 'string' && hex.length >= 7 ? hex : '#38BDF8';
  const r = parseInt(v.slice(1, 3), 16) || 0;
  const g = parseInt(v.slice(3, 5), 16) || 0;
  const b = parseInt(v.slice(5, 7), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#04101E' : '#F4F8FF';
}

function drawPack2(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const e = icEase(prog);
  const white = '#F4F8FF';
  const size = ecN(p.size, 46);
  const text = ecS(p.text, ecS(p.title, ''));

  /* ---- titles ---- */
  if (EC2_TITLE_IDS.indexOf(id) >= 0) {
    const t = ecXY(p, W, H, 0.5, 0.18);
    const tsz = ecN(p.size, 70);
    if (id === 'echoTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      for (let i = 3; i >= 1; i--) {
        ecAlpha(ctx, GA, 0.16 * (4 - i) * e);
        ecText(ctx, text, t.x + i * 16, t.y + i * 9, tsz, i % 2 ? acc : col, 'center', 900);
      }
      ecAlpha(ctx, GA, e);
      ecText(ctx, text, t.x, t.y, tsz, white, 'center', 900);

    } else if (id === 'neonSign') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      const flick = 0.82 + 0.18 * Math.sin(el * 17) * Math.sin(el * 3.1);
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 30 + 14 * flick;
      ctx.lineWidth = 4; ctx.strokeStyle = col;
      ecFont(ctx, tsz, 900);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = ecClamp(GA * flick, 0, 1);
      ctx.strokeText(text, t.x, t.y);
      ctx.globalAlpha = ecClamp(GA * 0.3 * flick, 0, 1);
      ctx.shadowBlur = 60;
      ctx.fillStyle = col; ctx.fillText(text, t.x, t.y);
      ctx.restore();

    } else if (id === 'magazineTitle') {
      ecAlpha(ctx, GA, e);
      ecText(ctx, ecS(p.label, 'ISSUE 01'), t.x - tsz * 3, t.y - tsz * 0.85, tsz * 0.22, acc, 'left', 700);
      ecText(ctx, text, t.x, t.y, tsz, white, 'center', 900);
      ecLine(ctx, t.x - tsz * 3, t.y + tsz * 0.62, t.x + tsz * 3, t.y + tsz * 0.62, white, 3);

    } else if (id === 'verticalStack') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      const parts = text.split(/\s+/).slice(0, 3);
      for (let i = 0; i < parts.length; i++) {
        const q = ecClamp((prog - i * 0.15) / 0.5, 0, 1);
        ecAlpha(ctx, GA, icEase(q));
        ecText(ctx, parts[i], t.x + (i % 2 ? tsz : -tsz) * 0.6, t.y + (i - 1) * tsz * 1.05, tsz, i % 2 ? acc : white, 'center', 900);
      }

    } else if (id === 'typeOnTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      const n = Math.floor(ecClamp(prog, 0, 1) * text.length);
      ecAlpha(ctx, GA, 1);
      ecText(ctx, text.slice(0, n), t.x, t.y, tsz, white, 'center', 800);
      if (Math.floor(el * 2) % 2 === 0 && n < text.length) {
        ecFont(ctx, tsz, 800);
        const wid = ctx.measureText(text.slice(0, n)).width;
        ecLine(ctx, t.x - ctx.measureText(text).width / 2 + wid + 4, t.y - tsz * 0.5,
               t.x - ctx.measureText(text).width / 2 + wid + 4, t.y + tsz * 0.5, acc, 4);
      }

    } else if (id === 'glitchTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      ecAlpha(ctx, GA, 0.7);
      ecText(ctx, text, t.x - 7, t.y, tsz, '#FF3355', 'center', 900);
      ecText(ctx, text, t.x + 7, t.y, tsz, '#33E0FF', 'center', 900);
      ecAlpha(ctx, GA, 1);
      ecText(ctx, text, t.x, t.y, tsz, white, 'center', 900);

    } else if (id === 'sliceTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      for (let i = 0; i < 8; i++) {
        const top = t.y - tsz * 0.6 + (i / 8) * tsz * 1.2;
        const off = Math.sin(el * 4 + i) * 10 * e;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, top, W, tsz * 0.15); ctx.clip();
        ecAlpha(ctx, GA, 1);
        ecText(ctx, text, t.x + off, t.y, tsz, i % 3 === 0 ? acc : white, 'center', 900);
        ctx.restore();
      }

    } else if (id === 'curveTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      ecFont(ctx, tsz, 900);
      const chars = text.split('');
      let total = 0;
      const widths = chars.map(c => { const wd = ctx.measureText(c).width; total += wd; return wd; });
      let cx = t.x - total / 2;
      for (let i = 0; i < chars.length; i++) {
        const ang = Math.sin((i / Math.max(1, chars.length - 1)) * Math.PI * 1.6 + el) * 0.22;
        ctx.save();
        ctx.translate(cx + widths[i] / 2, t.y + Math.sin(i * 0.5 + el) * 18 * e);
        ctx.rotate(ang);
        ecAlpha(ctx, GA, 1);
        ctx.fillStyle = i % 4 === 3 ? acc : white;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();
        cx += widths[i];
      }

    } else if (id === 'marqueeBand') {
      const band = tsz * 1.5;
      ecAlpha(ctx, GA, 1);
      ctx.fillStyle = col; ctx.fillRect(0, t.y - band / 2, W, band);
      ecFont(ctx, tsz * 0.8, 900);
      const unit = ctx.measureText((text || ' ') + '  ·  ').width;
      const off = (el * 180) % Math.max(1, unit);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, t.y - band / 2, W, band); ctx.clip();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#04101E';
      for (let tx = -off; tx < W; tx += unit) ctx.fillText(text, tx, t.y);
      ctx.restore();
      ecAlpha(ctx, GA, 0.8);
      ecLine(ctx, 0, t.y + band / 2 + 30, W, t.y + band / 2 + 30, acc, 4);

    } else if (id === 'spotlightTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      ecAlpha(ctx, GA, 0.62);
      ctx.fillStyle = '#04070F'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(t.x, t.y, 10, t.x, t.y, tsz * 5);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ecAlpha(ctx, GA, 1);
      ecText(ctx, text, t.x, t.y, tsz, white, 'center', 900);

    } else if (id === 'countUpTitle') {
      const q = Math.min(1, prog * 1.15);
      const v = Math.round((p.from ?? 0) + ((p.to ?? 100) - (p.from ?? 0)) * q);
      ecAlpha(ctx, GA, 1);
      ecText(ctx, (p.prefix || '') + v.toLocaleString() + (p.suffix || ''), t.x, t.y, tsz * 1.6, acc, 'center', 900);
      ecText(ctx, ecS(p.label, text), t.x, t.y + tsz * 1.1, tsz * 0.32, white, 'center', 700);

    } else if (id === 'multilineTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      const lines = ecWrap(ctx, text, W * 0.8, tsz, 900);
      for (let i = 0; i < lines.length; i++) {
        ecAlpha(ctx, GA, icEase(ecClamp(prog * 2 - i * 0.25, 0, 1)));
        ecText(ctx, lines[i], t.x, t.y + (i - (lines.length - 1) / 2) * tsz * 1.15, tsz, i === lines.length - 1 ? acc : white, 'center', 900);
      }

    } else if (id === 'quoteTitle') {
      if (!text) { ecSkeleton(ctx, t.x, t.y, tsz, GA, col); return; }
      ecAlpha(ctx, GA, e);
      ecText(ctx, '\u201C', t.x - Math.min(W * 0.34, tsz * 3.6), t.y - tsz * 0.75, tsz * 2.2, acc, 'center', 900);
      const lines = ecWrap(ctx, text, W * 0.74, tsz * 0.8, 700);
      for (let i = 0; i < lines.length; i++) {
        ecText(ctx, lines[i], t.x, t.y + (i - (lines.length - 1) / 2) * tsz * 1.0, tsz * 0.8, white, 'center', 700);
      }

    } else if (id === 'labelStack') {
      for (let i = 0; i < 3; i++) {
        const ly = t.y + (i - 1) * tsz * 1.05;
        ecAlpha(ctx, GA, icEase(ecClamp(prog * 2 - i * 0.3, 0, 1)));
        ctx.fillStyle = i === 0 ? acc : col;
        ctx.beginPath(); ctx.arc(t.x - tsz * 3.5, ly, 9, 0, Math.PI * 2); ctx.fill();
        ecText(ctx, ecS(p.items && p.items[i] && p.items[i].label, text), t.x - tsz * 3.1, ly, tsz * 0.42, white, 'left', 700);
        ecLine(ctx, t.x - tsz * 3.1, ly + tsz * 0.36, t.x + tsz * 3.4, ly + tsz * 0.36, 'rgba(148,163,184,0.4)', 2);
      }
    }
    return;
  }

  /* ---- captions ---- */
  if (EC2_CAPTION_IDS.indexOf(id) >= 0) {
    const t = ecXY(p, W, H, 0.5, 0.8);
    const csz = ecN(p.size, 42);
    if (!text) { ecSkeleton(ctx, t.x, t.y, csz * 0.85, GA, col); return; }
    const lines = ecWrap(ctx, text, W * 0.84, csz, 800);
    const lh = csz * 1.3;
    const bh = lines.length * lh;
    if (id === 'captionBox') {
      ecAlpha(ctx, GA, e);
      let widest = 0;
      ecFont(ctx, csz, 800);
      for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
      ecPanel(ctx, t.x - widest / 2 - 26, t.y - bh / 2 - 16, widest + 52, bh + 32, 6, 'rgba(8,13,24,0.9)', acc, 4);
      for (let i = 0; i < lines.length; i++) ecText(ctx, lines[i], t.x, t.y - bh / 2 + lh * (i + 0.5), csz, white, 'center', 800);

    } else if (id === 'captionBounce') {
      ecFont(ctx, csz, 900);
      const words = text.split(/\s+/).filter(Boolean);
      let total = 0;
      const widths = words.map(w => { const wd = ctx.measureText(w).width; total += wd; return wd; });
      total += Math.max(0, words.length - 1) * csz * 0.24;
      let cx = t.x - total / 2;
      for (let i = 0; i < words.length; i++) {
        const q = ecClamp((prog - i / Math.max(1, words.length) * 0.5) / 0.3, 0, 1);
        const qe = icEase(q);
        ecAlpha(ctx, GA, qe);
        ctx.font = '900 ' + Math.round(csz) + 'px ' + EC_FONT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = white;
        ctx.fillText(words[i], cx, t.y - Math.abs(Math.sin(qe * Math.PI)) * csz * 0.5);
        cx += widths[i] + csz * 0.24;
      }

    } else if (id === 'captionSplit') {
      ecFont(ctx, csz, 900);
      const words = text.split(/\s+/).filter(Boolean);
      let total = 0;
      const widths = words.map(w => { const wd = ctx.measureText(w).width; total += wd; return wd; });
      total += Math.max(0, words.length - 1) * csz * 0.24;
      let cx = t.x - total / 2;
      for (let i = 0; i < words.length; i++) {
        ecAlpha(ctx, GA, 1);
        ctx.font = '900 ' + Math.round(csz) + 'px ' + EC_FONT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = i % 2 ? acc : white;
        ctx.fillText(words[i], cx, t.y);
        cx += widths[i] + csz * 0.24;
      }

    } else if (id === 'captionGradient') {
      ecAlpha(ctx, GA, 1);
      let widest = 0;
      ecFont(ctx, csz, 900);
      for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
      ctx.fillStyle = ecGrad(ctx, t.x - widest / 2, 0, t.x + widest / 2, 0, [[0, col], [1, acc]]);
      for (let i = 0; i < lines.length; i++) {
        ctx.font = '900 ' + Math.round(csz) + 'px ' + EC_FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lines[i], t.x, t.y - bh / 2 + lh * (i + 0.5));
      }

    } else if (id === 'captionNeon') {
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 24 + 8 * Math.sin(el * 4);
      ecAlpha(ctx, GA, 1);
      for (let i = 0; i < lines.length; i++) ecText(ctx, lines[i], t.x, t.y - bh / 2 + lh * (i + 0.5), csz, col, 'center', 900);
      ctx.restore();

    } else if (id === 'captionHandwrite') {
      ecAlpha(ctx, GA, 1);
      for (let i = 0; i < lines.length; i++) ecText(ctx, lines[i], t.x, t.y - bh / 2 + lh * (i + 0.5), csz, white, 'center', 700);
      ecAlpha(ctx, GA, 0.9);
      ctx.strokeStyle = acc; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      const w0 = t.x - W * 0.25, w1 = t.x + W * 0.25;
      for (let i = 0; i <= 40 * e; i++) {
        const px = w0 + (w1 - w0) * (i / 40);
        const py = t.y + bh / 2 + 12 + Math.sin(i * 0.8) * 7;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

    } else if (id === 'captionTicker') {
      const band = csz * 2.2;
      ecAlpha(ctx, GA, 0.85);
      ecPanel(ctx, 0, t.y - band / 2, W, band, 0, 'rgba(8,13,24,0.75)', null, 0);
      ecFont(ctx, csz * 0.8, 800);
      const unit = ctx.measureText(text + '   ').width;
      ctx.save(); ctx.beginPath(); ctx.rect(0, t.y - band / 2, W, band / 2); ctx.clip();
      ecAlpha(ctx, GA, 1); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = white;
      for (let tx = -((el * 140) % unit); tx < W; tx += unit) ctx.fillText(text, tx, t.y - band / 4);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, t.y, W, band / 2); ctx.clip();
      ctx.fillStyle = acc;
      for (let tx = -unit + ((el * 90) % unit); tx < W; tx += unit) ctx.fillText(text, tx, t.y + band / 4);
      ctx.restore();

    } else if (id === 'captionTimed') {
      ecAlpha(ctx, GA, 1);
      for (let i = 0; i < lines.length; i++) ecText(ctx, lines[i], t.x, t.y - 20, csz, white, 'center', 800);
      const words = text.split(/\s+/).filter(Boolean);
      const dots = Math.min(12, Math.max(3, words.length));
      const dw = 14, gap = 12, total = dots * dw + (dots - 1) * gap;
      for (let i = 0; i < dots; i++) {
        const lit = (i + 1) / dots <= prog;
        ecAlpha(ctx, GA, lit ? 1 : 0.3);
        ctx.fillStyle = lit ? acc : white;
        ctx.beginPath(); ctx.arc(t.x - total / 2 + i * (dw + gap) + dw / 2, t.y + csz * 1.1, 6, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'captionArrow') {
      ecAlpha(ctx, GA, e);
      for (let i = 0; i < lines.length; i++) ecText(ctx, lines[i], t.x, t.y, csz, white, 'center', 800);
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(t.x - 18, t.y - csz * 1.1);
      ctx.lineTo(t.x + 18, t.y - csz * 1.1);
      ctx.lineTo(t.x, t.y - csz * 1.45);
      ctx.closePath(); ctx.fill();

    } else if (id === 'captionBracket') {
      ecFont(ctx, csz, 800);
      const wid = Math.max.apply(null, lines.map(ln => ctx.measureText(ln).width).concat([100]));
      ecAlpha(ctx, GA, 1);
      for (let i = 0; i < lines.length; i++) ecText(ctx, lines[i], t.x, t.y - bh / 2 + lh * (i + 0.5), csz, white, 'center', 800);
      ecAlpha(ctx, GA, 0.9);
      ctx.strokeStyle = acc; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const bx = wid / 2 + 26;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(t.x + side * bx, t.y - bh / 2 - 4);
        ctx.lineTo(t.x + side * (bx + 22), t.y - bh / 2 - 4);
        ctx.moveTo(t.x + side * bx, t.y - bh / 2 - 4); ctx.lineTo(t.x + side * bx, t.y + bh / 2 + 4);
        ctx.moveTo(t.x + side * bx, t.y + bh / 2 + 4); ctx.lineTo(t.x + side * (bx + 22), t.y + bh / 2 + 4);
        ctx.stroke();
      }
    }
    return;
  }

  /* ---- shapes ---- */
  if (EC2_SHAPE_IDS.indexOf(id) >= 0) {
    const r = ecN(p.radius, 140);
    if (id === 'squareOutline') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(el * 0.6);
      ecAlpha(ctx, GA, 0.95); ctx.strokeStyle = col; ctx.lineWidth = 6;
      ctx.strokeRect(-r * e / 2, -r * e / 2, r * e, r * e);
      ctx.restore();

    } else if (id === 'roundedSquare') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-el * 0.4);
      ecAlpha(ctx, GA, 0.95);
      ecPanel(ctx, -r / 2, -r / 2, r * e, r * e, r * 0.18, null, acc, 6);
      ctx.fillStyle = col;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * r / 2, sy * r / 2, 9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    } else if (id === 'crossShape') {
      const t0 = r * 0.28 * e;
      ctx.save(); ctx.translate(x, y); ctx.rotate(el * 0.5);
      ecAlpha(ctx, GA, 0.95); ctx.fillStyle = col;
      ctx.fillRect(-t0 / 2, -r / 2, t0, r);
      ctx.fillRect(-r / 2, -t0 / 2, r, t0);
      ctx.restore();

    } else if (id === 'plusGrid') {
      for (let row = -2; row <= 2; row++) for (let c0 = -2; c0 <= 2; c0++) {
        const q = 0.5 + 0.5 * Math.sin(el * 2 - Math.hypot(row, c0) * 0.8);
        const px = x + c0 * 78, py = y + row * 78, s0 = 16 + 10 * q;
        ecAlpha(ctx, GA, q * 0.9);
        ctx.fillStyle = q > 0.6 ? acc : col;
        ctx.fillRect(px - s0 / 2, py - 3, s0, 6);
        ctx.fillRect(px - 3, py - s0 / 2, 6, s0);
      }

    } else if (id === 'lineGrid') {
      ecAlpha(ctx, GA, 0.8);
      for (let i = 0; i < 7; i++) {
        const off = Math.sin(el + i) * 8;
        ecLine(ctx, x - r * 1.6, y - r + i * (r * 2 / 6) + off, x + r * 1.6, y - r + i * (r * 2 / 6) + off, i % 2 ? acc : col, 3);
      }
      for (let i = 0; i < 10; i++) {
        const off = Math.cos(el + i) * 8;
        ecLine(ctx, x - r * 1.6 + i * (r * 3.2 / 9) + off, y - r, x - r * 1.6 + i * (r * 3.2 / 9) + off, y + r, 'rgba(148,163,184,0.3)', 2);
      }

    } else if (id === 'arcRings') {
      for (let i = 0; i < 4; i++) {
        ecAlpha(ctx, GA, 0.9 - i * 0.15);
        ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 8; ctx.lineCap = 'round';
        const start = el * (0.6 + i * 0.3) + i;
        ctx.beginPath(); ctx.arc(x, y, r * (0.4 + i * 0.2) * e, start, start + 1.8); ctx.stroke();
      }

    } else if (id === 'dashedCircle') {
      ecAlpha(ctx, GA, 0.9);
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.setLineDash([18, 14]);
      ctx.lineDashOffset = -el * 40;
      ctx.beginPath(); ctx.arc(x, y, r * e, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

    } else if (id === 'polygonShape' || id === 'pentagonShape' || id === 'octagonShape') {
      const sides = id === 'pentagonShape' ? 5 : id === 'octagonShape' ? 8 : Math.max(3, Math.round(ecN(p.sides, 6)));
      ctx.save(); ctx.translate(x, y); ctx.rotate(el * 0.4);
      ecAlpha(ctx, GA, 0.4); ec2Gon(ctx, 0, 0, r * e, sides, 0); ctx.fillStyle = col; ctx.fill();
      ecAlpha(ctx, GA, 1); ctx.strokeStyle = acc; ctx.lineWidth = 6; ctx.stroke();
      ctx.restore();

    } else if (id === 'zigzagLine') {
      ecAlpha(ctx, GA, 0.95); ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.beginPath();
      const n = 8, stepW = (r * 2) / n;
      for (let i = 0; i <= n * e; i++) {
        const px = x - r + i * stepW, py = y + (i % 2 ? -1 : 1) * r * 0.35;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

    } else if (id === 'ladderShape') {
      ecAlpha(ctx, GA, 0.95); ctx.strokeStyle = col; ctx.lineWidth = 6;
      ecLine(ctx, x - r * 0.6, y - r, x - r * 0.6, y + r, col, 6);
      ecLine(ctx, x + r * 0.6, y - r, x + r * 0.6, y + r, col, 6);
      for (let i = 0; i < 6; i++) {
        const ly = y - r + i * (r * 2 / 5);
        ecAlpha(ctx, GA, 0.9);
        ecLine(ctx, x - r * 0.6, ly, x + r * 0.6, ly, i % 2 ? acc : white, 5);
      }

    } else if (id === 'fanShape') {
      for (let i = 0; i < 9; i++) {
        const ang = -Math.PI * 0.85 + (i / 8) * Math.PI * 0.7;
        ecAlpha(ctx, GA, 0.85);
        ecLine(ctx, x, y + r, x + Math.cos(ang) * r * 1.5, y + r + Math.sin(ang) * r * 1.5, i % 2 ? acc : col, 5);
      }
      ecAlpha(ctx, GA, 0.9);
      ctx.fillStyle = white;
      ctx.beginPath(); ctx.arc(x, y + r, 12, 0, Math.PI * 2); ctx.fill();

    } else if (id === 'crescentShape') {
      const rr = r * 0.85 * e;
      const ox = rr * 0.55 * Math.cos(el * 0.7), oy = rr * 0.55 * Math.sin(el * 0.7);
      ecAlpha(ctx, GA, 0.95);
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2, false);
      ctx.arc(x + ox, y + oy, rr * 0.86, 0, Math.PI * 2, true);
      ctx.fillStyle = col; ctx.fill();
    }
    return;
  }

  /* ---- charts ---- */
  if (EC2_CHART_IDS.indexOf(id) >= 0) {
    const f = ecFrame(p, W, H, 0.66, 0.3);
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    ecAlpha(ctx, GA, 0.5);
    ecPanel(ctx, f.x, f.y, f.w, f.h, 18, 'rgba(8,13,24,0.5)', 'rgba(148,163,184,0.26)', 2);
    ecAlpha(ctx, GA, 1);

    if (id === 'waterfallChart') {
      const n = 5, bw = (f.w - 60) / n - 12;
      let base = f.y + f.h - 34;
      for (let i = 0; i < n; i++) {
        const hgt = (f.h - 70) * (0.18 + 0.16 * (i % 3)) * e;
        const up = i % 2 === 0;
        ecAlpha(ctx, GA, 0.92);
        ctx.fillStyle = up ? col : '#F87171';
        ecRound(ctx, f.x + 30 + i * (bw + 12), up ? base - hgt : base, bw, hgt, 4); ctx.fill();
        base += up ? -hgt : hgt;
      }

    } else if (id === 'histogramChart') {
      const n = 9, bw = (f.w - 50) / n;
      for (let i = 0; i < n; i++) {
        const q = Math.exp(-Math.pow((i - 4) / 2.4, 2));
        const hgt = (f.h - 60) * q * e;
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = q > 0.55 ? acc : col;
        ctx.fillRect(f.x + 25 + i * bw, f.y + f.h - 26 - hgt, bw - 3, hgt);
      }

    } else if (id === 'boxPlot') {
      for (let i = 0; i < 3; i++) {
        const bx = f.x + 60 + i * (f.w - 120) / 3, bw = 70;
        const mid = f.y + f.h * (0.35 + ecHash(i * 3.3) * 0.3);
        const top = mid - 40, bot = mid + 38;
        ecAlpha(ctx, GA, 0.9 - i * 0.1);
        ecPanel(ctx, bx - bw / 2, top, bw, bot - top, 6, null, i === 0 ? acc : col, 3);
        ecLine(ctx, bx, f.y + 30, bx, top, col, 3);
        ecLine(ctx, bx, bot, bx, f.y + f.h - 30, col, 3);
        ecLine(ctx, bx - 18, mid, bx + 18, mid, white, 3);
      }

    } else if (id === 'candlestickChart') {
      const n = 8, cw = (f.w - 60) / n;
      for (let i = 0; i < n; i++) {
        const cxc = f.x + 30 + i * cw + cw / 2;
        const q = ecHash(i * 4.1), q2 = ecHash(i * 8.7);
        const mid = f.y + 40 + q * (f.h - 80);
        const top = mid - 12 - q2 * 30, bot = mid + 10 + (1 - q2) * 28;
        ecAlpha(ctx, GA, 0.95);
        ecLine(ctx, cxc, top - 16, cxc, bot + 14, 'rgba(148,163,184,0.7)', 2);
        ctx.fillStyle = i % 2 ? '#34D399' : '#F87171';
        ctx.fillRect(cxc - cw * 0.22, top, cw * 0.44, bot - top);
      }

    } else if (id === 'treemapGrid') {
      const cells = [[0, 0, 0.55, 0.6], [0.56, 0, 0.44, 0.35], [0.56, 0.36, 0.44, 0.24], [0, 0.61, 0.35, 0.39], [0.36, 0.61, 0.64, 0.39]];
      for (let i = 0; i < cells.length; i++) {
        const c0 = cells[i];
        ecAlpha(ctx, GA, 0.85 - i * 0.1);
        ctx.fillStyle = i % 2 ? acc : col;
        const q = i === 0 ? e : 1;
        ecRound(ctx, f.x + c0[0] * f.w, f.y + c0[1] * f.h, c0[2] * f.w * q, c0[3] * f.h * q, 6); ctx.fill();
      }

    } else if (id === 'sankeyFlow') {
      const lg = [0.25, 0.5, 0.75];
      for (let i = 0; i < 3; i++) {
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = i === 1 ? acc : col;
        ecRound(ctx, f.x + 20, f.y + f.h * lg[i] - 24, 26, 48, 5); ctx.fill();
        ecRound(ctx, f.x + f.w - 46, f.y + f.h * ((i + 1) % 3 * 0.33 + 0.17) - 24, 26, 48, 5); ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const y0 = f.y + f.h * lg[i], y1 = f.y + f.h * ((i + 1) % 3 * 0.33 + 0.17);
        ecAlpha(ctx, GA, 0.3);
        ctx.strokeStyle = i === 1 ? acc : col; ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(f.x + 48, y0);
        ctx.bezierCurveTo(cx, y0, cx, y1, f.x + f.w - 48, y1);
        ctx.stroke();
      }

    } else if (id === 'chordDiagram') {
      const rr = Math.min(f.w, f.h) * 0.38;
      ecAlpha(ctx, GA, 0.35);
      ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rr + 22, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 3) % 6 / 6) * Math.PI * 2;
        ecAlpha(ctx, GA, 0.45);
        ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
        ctx.quadraticCurveTo(cx, cy, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr); ctx.stroke();
      }

    } else if (id === 'bulletChart') {
      const val = ecClamp(ecN(p.value, 0.68) * e, 0, 1);
      const bw = f.w - 80, bh = 54;
      ecAlpha(ctx, GA, 0.2); ctx.fillStyle = white;
      ctx.fillRect(f.x + 40, cy - bh / 2, bw, bh);
      ecAlpha(ctx, GA, 1); ctx.fillStyle = col;
      ctx.fillRect(f.x + 40, cy - bh / 2, bw * val, bh);
      ctx.fillStyle = acc;
      ctx.fillRect(f.x + 40 + bw * 0.82, cy - bh / 2 - 10, 6, bh + 20);
      ecText(ctx, ecS(p.label, Math.round(val * 100) + ''), f.x + 40, cy + bh, 28, white, 'left', 700);

    } else if (id === 'dumbbellChart') {
      for (let i = 0; i < 4; i++) {
        const ly = f.y + 40 + i * ((f.h - 70) / 4);
        const x0 = f.x + 50 + ecHash(i * 3.1) * f.w * 0.3;
        const x1 = x0 + f.w * (0.2 + ecHash(i * 7.3) * 0.35) * e;
        ecAlpha(ctx, GA, 0.85);
        ecLine(ctx, x0, ly, x1, ly, 'rgba(148,163,184,0.6)', 6);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x0, ly, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x1, ly, 11, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'slopeChart') {
      const left = [], right = [];
      for (let i = 0; i < 4; i++) {
        left.push(f.y + 35 + ecHash(i * 4.4) * (f.h - 70));
        right.push(f.y + 35 + ecHash(i * 9.2 + 1) * (f.h - 70));
      }
      for (let i = 0; i < 4; i++) {
        ecAlpha(ctx, GA, 0.85);
        ecLine(ctx, f.x + 50, left[i], f.x + f.w - 50, right[i], i === 0 ? acc : col, 5);
        ctx.fillStyle = i === 0 ? acc : col;
        ctx.beginPath(); ctx.arc(f.x + 50, left[i], 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(f.x + f.w - 50, right[i], 8, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'waffleChart') {
      const cols = 10, rows = 6;
      const cw = (f.w - 40) / cols, ch = (f.h - 40) / rows;
      const filled = Math.round(ecClamp(ecN(p.value, 0.68), 0, 1) * cols * rows * e);
      for (let i = 0; i < cols * rows; i++) {
        const c0 = i % cols, r0 = Math.floor(i / cols);
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = i < filled ? (i % 7 === 0 ? acc : col) : 'rgba(148,163,184,0.18)';
        ecRound(ctx, f.x + 20 + c0 * cw + 2, f.y + 20 + r0 * ch + 2, cw - 6, ch - 6, 4); ctx.fill();
      }

    } else if (id === 'radialBarChart') {
      const rr = Math.min(f.w, f.h) * 0.4;
      for (let i = 0; i < 3; i++) {
        const v = ecClamp((0.9 - i * 0.2) * e, 0, 1);
        ecAlpha(ctx, GA, 0.25);
        ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.arc(cx, cy, rr - i * 26, Math.PI, Math.PI * 2); ctx.stroke();
        ecAlpha(ctx, GA, 1);
        ctx.strokeStyle = i % 2 ? acc : col;
        ctx.beginPath(); ctx.arc(cx, cy, rr - i * 26, Math.PI, Math.PI + Math.PI * v); ctx.stroke();
      }

    } else if (id === 'progressStack') {
      const bw = f.w - 60, bh = 48, parts = [0.45, 0.3, 0.25];
      let px = f.x + 30;
      for (let i = 0; i < 3; i++) {
        const wPart = bw * parts[i] * e;
        ecAlpha(ctx, GA, 0.95);
        ctx.fillStyle = [col, acc, '#8B5CF6'][i];
        ctx.fillRect(px, cy - bh / 2, Math.max(0, wPart - 3), bh);
        px += wPart;
      }
      ecText(ctx, ecS(p.label, 'Budget'), f.x + 30, cy + bh, 26, white, 'left', 700);

    } else if (id === 'latencyBars') {
      for (let i = 0; i < 5; i++) {
        const ly = f.y + 36 + i * ((f.h - 64) / 5);
        const v = ecClamp(ecHash(i * 5.9) * 0.85 + 0.1, 0, 1) * e;
        ecAlpha(ctx, GA, 0.9);
        ecPanel(ctx, f.x + 40, ly, (f.w - 90) * v, 26, 6, v > 0.7 ? '#F87171' : col, null, 0);
      }
      ecAlpha(ctx, GA, 0.8);
      ecLine(ctx, f.x + 40 + (f.w - 90) * 0.72, f.y + 20, f.x + 40 + (f.w - 90) * 0.72, f.y + f.h - 20, acc, 3);
    }
    return;
  }

  /* ---- UI ---- */
  if (EC2_UI_IDS.indexOf(id) >= 0) {
    if (id === 'mobileTabBar') {
      const bw = 560, bh = 96;
      ecAlpha(ctx, GA, e);
      ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, bh / 2, 'rgba(10,16,28,0.94)', 'rgba(148,163,184,0.3)', 2);
      for (let i = 0; i < 4; i++) {
        const ix = x - bw / 2 + 70 + i * ((bw - 140) / 3);
        ecAlpha(ctx, GA, i === 1 ? 1 : 0.45);
        ctx.fillStyle = i === 1 ? acc : white;
        ctx.beginPath(); ctx.arc(ix, y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ix - 12, y + 22, 24, 5);
      }

    } else if (id === 'listRows') {
      const bw = 560, rh = 92;
      for (let i = 0; i < 4; i++) {
        const ry = y - rh * 2 + i * rh;
        ecAlpha(ctx, GA, 0.9);
        ecPanel(ctx, x - bw / 2, ry + 6, bw, rh - 12, 12, i === 0 ? 'rgba(56,189,248,0.16)' : 'rgba(148,163,184,0.1)', null, 0);
        ctx.fillStyle = i === 0 ? col : 'rgba(148,163,184,0.5)';
        ctx.beginPath(); ctx.arc(x - bw / 2 + 44, ry + rh / 2, 20, 0, Math.PI * 2); ctx.fill();
        ecAlpha(ctx, GA, 0.8);
        ctx.fillStyle = white;
        ecRound(ctx, x - bw / 2 + 84, ry + 28, bw * 0.45, 12, 6); ctx.fill();
        ctx.globalAlpha = ecClamp(GA * 0.35, 0, 1);
        ecRound(ctx, x - bw / 2 + 84, ry + 52, bw * 0.3, 10, 5); ctx.fill();
      }

    } else if (id === 'profileCard') {
      const bw = 460, bh = 340;
      ecAlpha(ctx, GA, e);
      ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 26, 'rgba(10,16,28,0.95)', 'rgba(148,163,184,0.3)', 2);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y - bh / 2 + 92, 58, 0, Math.PI * 2); ctx.fill();
      ecText(ctx, ecS(p.text, ecS(p.label, '')), x, y + 10, 34, white, 'center', 800);
      ecAlpha(ctx, GA, 0.4); ctx.fillStyle = white;
      ecRound(ctx, x - 120, y + 48, 240, 12, 6); ctx.fill();
      ecAlpha(ctx, GA, 0.9); ctx.fillStyle = acc;
      ecRound(ctx, x - 90, y + 92, 180, 44, 22); ctx.fill();
      ecText(ctx, ecS(p.subtitle, 'Follow'), x, y + 114, 24, '#04101E', 'center', 800);

    } else if (id === 'pricingCard') {
      const bw = 420, bh = 380;
      ecAlpha(ctx, GA, e);
      ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 26, 'rgba(10,16,28,0.95)', col, 3);
      ecText(ctx, ecS(p.label, 'PRO'), x, y - bh / 2 + 54, 26, acc, 'center', 800);
      ecText(ctx, ecS(p.value, '$29'), x, y - bh / 2 + 132, 74, white, 'center', 900);
      for (let i = 0; i < 4; i++) {
        ecAlpha(ctx, GA, 0.55);
        ctx.fillStyle = white;
        ecRound(ctx, x - 130, y - 10 + i * 40, 260 - i * 24, 12, 6); ctx.fill();
      }
      ecAlpha(ctx, GA, 1); ctx.fillStyle = col;
      ecRound(ctx, x - 140, y + bh / 2 - 74, 280, 48, 24); ctx.fill();

    } else if (id === 'calendarStrip') {
      const cw = 92, gap = 10, total = 7 * cw + 6 * gap;
      for (let i = 0; i < 7; i++) {
        const cx0 = x - total / 2 + i * (cw + gap);
        const on = i === 3;
        ecAlpha(ctx, GA, on ? 1 : 0.55);
        ecPanel(ctx, cx0, y - 60, cw, 120, 14, on ? col : 'rgba(148,163,184,0.14)', null, 0);
        ecText(ctx, String(12 + i), cx0 + cw / 2, y - 18, 30, on ? '#04101E' : white, 'center', 800);
        ecText(ctx, ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i], cx0 + cw / 2, y + 26, 18, on ? '#04101E' : white, 'center', 600);
      }

    } else if (id === 'clockFace') {
      const rr = ecN(p.radius, 140) * e;
      ecAlpha(ctx, GA, 0.9);
      ctx.strokeStyle = white; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        ecLine(ctx, x + Math.cos(ang) * rr * 0.86, y + Math.sin(ang) * rr * 0.86,
               x + Math.cos(ang) * rr * 0.96, y + Math.sin(ang) * rr * 0.96, i % 3 ? 'rgba(148,163,184,0.6)' : acc, 3);
      }
      const hAng = el * 0.5 - Math.PI / 2, mAng = el * 2.4 - Math.PI / 2;
      ecLine(ctx, x, y, x + Math.cos(hAng) * rr * 0.5, y + Math.sin(hAng) * rr * 0.5, white, 7);
      ecLine(ctx, x, y, x + Math.cos(mAng) * rr * 0.74, y + Math.sin(mAng) * rr * 0.74, acc, 4);
      ctx.fillStyle = white; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();

    } else if (id === 'batteryMeter') {
      const bw = 300, bh = 140;
      ecAlpha(ctx, GA, 0.9);
      ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 16, null, white, 6);
      ctx.fillStyle = white; ctx.fillRect(x + bw / 2, y - 26, 18, 52);
      const val = ecClamp(ecN(p.value, 0.72) * e, 0, 1);
      ctx.fillStyle = val > 0.5 ? '#34D399' : val > 0.2 ? acc : '#F87171';
      ecRound(ctx, x - bw / 2 + 10, y - bh / 2 + 10, (bw - 20) * val, bh - 20, 8); ctx.fill();

    } else if (id === 'signalBars') {
      for (let i = 0; i < 4; i++) {
        const bh = 26 + i * 22;
        ecAlpha(ctx, GA, i < 3 ? 1 : 0.3);
        ctx.fillStyle = i < 3 ? (i === 2 ? acc : col) : white;
        ecRound(ctx, x - 110 + i * 62, y + 70 - bh, 42, bh, 6); ctx.fill();
      }

    } else if (id === 'wifiIcon') {
      for (let i = 0; i < 3; i++) {
        ecAlpha(ctx, GA, 1 - i * 0.15);
        ctx.strokeStyle = i === 0 ? acc : col; ctx.lineWidth = 13; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y + 60, 46 + i * 46, -Math.PI * 0.78, -Math.PI * 0.22); ctx.stroke();
      }
      ctx.fillStyle = white; ctx.beginPath(); ctx.arc(x, y + 66, 13, 0, Math.PI * 2); ctx.fill();

    } else if (id === 'playButton') {
      const rr = ecN(p.radius, 110) * e;
      ecAlpha(ctx, GA, 1); ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04101E';
      ctx.beginPath();
      ctx.moveTo(x - rr * 0.25, y - rr * 0.42);
      ctx.lineTo(x + rr * 0.45, y);
      ctx.lineTo(x - rr * 0.25, y + rr * 0.42);
      ctx.closePath(); ctx.fill();

    } else if (id === 'badgeCheck') {
      const rr = ecN(p.radius, 130) * e;
      ecAlpha(ctx, GA, 1);
      ec2Gon(ctx, x, y, rr, 8, Math.PI / 8); ctx.fillStyle = col; ctx.fill();
      const q = ecClamp((prog - 0.15) / 0.6, 0, 1);
      ctx.strokeStyle = '#04101E'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - rr * 0.35, y);
      ctx.lineTo(x - rr * 0.08, y + rr * 0.28);
      ctx.lineTo(x - rr * 0.35 + rr * 0.82 * q, y + rr * 0.28 - rr * 0.66 * q);
      ctx.stroke();

    } else if (id === 'bellIcon') {
      const rr = ecN(p.radius, 100) * e;
      const swing = Math.sin(el * 4) * 0.12;
      ctx.save(); ctx.translate(x, y); ctx.rotate(swing);
      ecAlpha(ctx, GA, 1); ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-rr * 0.7, rr * 0.4);
      ctx.quadraticCurveTo(-rr * 0.7, -rr * 0.7, 0, -rr * 0.7);
      ctx.quadraticCurveTo(rr * 0.7, -rr * 0.7, rr * 0.7, rr * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-rr * 0.85, rr * 0.4, rr * 1.7, rr * 0.14);
      ctx.beginPath(); ctx.arc(0, rr * 0.66, rr * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (id === 'menuIcon') {
      for (let i = 0; i < 3; i++) {
        ecAlpha(ctx, GA, 1 - i * 0.1);
        ctx.fillStyle = i === 1 ? acc : white;
        const w = 200 - (i === 1 ? 60 : 0);
        ecRound(ctx, x - w / 2, y - 50 + i * 50, w, 18, 9); ctx.fill();
      }

    } else if (id === 'shareIcon') {
      const pts = [[x - 100, y + 70], [x + 90, y - 70], [x + 110, y + 50]];
      ecAlpha(ctx, GA, 0.9);
      ctx.strokeStyle = col; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
      const colors = [acc, white, col];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = colors[i];
        ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 22, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'downloadBar') {
      const w = 520, h = 96;
      ecAlpha(ctx, GA, 0.95);
      ecPanel(ctx, x - w / 2, y - h / 2, w, h, h / 2, 'rgba(148,163,184,0.16)', null, 0);
      const val = ecClamp(ecN(p.value, prog), 0, 1);
      ecAlpha(ctx, GA, 1);
      ecPanel(ctx, x - w / 2, y - h / 2, Math.max(h, w * val), h, h / 2, col, null, 0);
      ecText(ctx, ecS(p.label, Math.round(val * 100) + '%'), x, y, 30, val > 0.5 ? '#04101E' : white, 'center', 800);
      ec2Arrow(ctx, x - w / 2 + 34, y, Math.PI / 2, 16, val > 0.5 ? '#04101E' : white);

    } else if (id === 'stepperDots') {
      const n = 5, gap = 56, total = (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        const dx = x - total / 2 + i * gap;
        const on = i === Math.min(n - 1, Math.floor(prog * n));
        ecAlpha(ctx, GA, on ? 1 : 0.4);
        if (i > 0) ecLine(ctx, dx - gap + 10, y, dx - 10, y, 'rgba(148,163,184,0.5)', 3);
        ctx.fillStyle = on ? acc : white;
        ctx.beginPath(); ctx.arc(dx, y, on ? 18 : 10, 0, Math.PI * 2); ctx.fill();
      }
    }
    return;
  }

  /* ---- motion ---- */
  if (EC2_MOTION_IDS.indexOf(id) >= 0) {
    const r = ecN(p.radius, 130);
    if (id === 'spinningCube') {
      const pts = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx, sy, sz]);
      const ang = el * 0.9;
      const proj = pts.map(([sx, sy, sz]) => {
        const rx = sx * Math.cos(ang) - sz * Math.sin(ang);
        const rz = sx * Math.sin(ang) + sz * Math.cos(ang);
        const ry = sy * Math.cos(ang * 0.7) - rz * Math.sin(ang * 0.7);
        const persp = 1 / (1 + (rz + 2) * 0.18);
        return [x + rx * r * persp, y + ry * r * persp];
      });
      ecAlpha(ctx, GA, 0.9);
      const edges = [[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]];
      for (const [a0, b0] of edges) {
        ecLine(ctx, proj[a0][0], proj[a0][1], proj[b0][0], proj[b0][1], a0 % 2 ? acc : col, 3);
      }

    } else if (id === 'waveDots') {
      for (let i = 0; i < 14; i++) {
        const px = x - r * 1.5 + (i / 13) * r * 3;
        const py = y + Math.sin(el * 3 + i * 0.55) * r * 0.45;
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = i % 3 === 0 ? acc : col;
        ctx.beginPath(); ctx.arc(px, py, 9 + 4 * Math.cos(el * 3 + i * 0.55), 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'orbitTrail') {
      for (let i = 0; i < 20; i++) {
        const ang = el * 1.6 - i * 0.08;
        ecAlpha(ctx, GA, (1 - i / 22) * 0.95);
        ctx.fillStyle = i % 5 === 0 ? acc : col;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.62, 14 * (1 - i / 24), 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'bouncingArrows') {
      for (let i = 0; i < 3; i++) {
        const q = (el * 0.8 + i / 3) % 1;
        ecAlpha(ctx, GA, Math.sin(q * Math.PI));
        ec2Arrow(ctx, x - r + q * r * 2, y + (i - 1) * r * 0.5, Math.sin(el * 4 + i) * 0.25, 34, i % 2 ? acc : col);
      }

    } else if (id === 'rotatingTriangles') {
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + el;
        const dist = r * (0.5 + 0.3 * e);
        const s0 = 30;
        ctx.save();
        ctx.translate(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist);
        ctx.rotate(ang * 1.7);
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = i % 2 ? acc : col;
        ctx.beginPath(); ctx.moveTo(0, -s0); ctx.lineTo(s0 * 0.9, s0); ctx.lineTo(-s0 * 0.9, s0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

    } else if (id === 'flowingWaveLines') {
      for (let ln = 0; ln < 6; ln++) {
        ecAlpha(ctx, GA, 0.75 - ln * 0.09);
        ctx.strokeStyle = ln % 2 ? acc : col; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const px = x - r * 1.5 + (i / 50) * r * 3;
          const py = y + (ln - 2.5) * 20 + Math.sin((i / 50) * Math.PI * 2 + el * 2 + ln * 0.5) * 26;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

    } else if (id === 'spiralDots') {
      for (let i = 0; i < 40; i++) {
        const q = i / 40;
        const ang = q * Math.PI * 4 + el;
        const rad = r * q;
        ecAlpha(ctx, GA, 0.35 + 0.6 * q);
        ctx.fillStyle = i % 4 === 0 ? acc : col;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 4 + 8 * q, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'heartbeatLine') {
      const w2 = r * 2.2;
      ecAlpha(ctx, GA, 1); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const q = i / 120;
        const phase = (q * 3 + el * 0.5) % 1;
        let py = 0;
        if (phase > 0.4 && phase < 0.46) py = -70 * Math.sin((phase - 0.4) / 0.06 * Math.PI);
        else if (phase > 0.5 && phase < 0.54) py = 26 * Math.sin((phase - 0.5) / 0.04 * Math.PI);
        const px = x - w2 / 2 + q * w2;
        if (i === 0) ctx.moveTo(px, y + py); else ctx.lineTo(px, y + py);
      }
      ctx.stroke();

    } else if (id === 'radarSweep') {
      const rr = r * e;
      ecAlpha(ctx, GA, 0.7); ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, rr * 0.6, 0, Math.PI * 2); ctx.stroke();
      ecAlpha(ctx, GA, 0.4);
      ecLine(ctx, x - rr, y, x + rr, y, col, 1.5);
      ecLine(ctx, x, y - rr, x, y + rr, col, 1.5);
      const ang = el * 2;
      const g = ctx.createRadialGradient(x, y, 2, x, y, rr);
      g.addColorStop(0, acc); g.addColorStop(1, 'transparent');
      ecAlpha(ctx, GA, 0.5);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, rr, ang - 0.5, ang); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ecLine(ctx, x, y, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, acc, 3);

    } else if (id === 'sonarBlips') {
      for (let i = 0; i < 4; i++) {
        const q = (el * 0.5 + i / 4) % 1;
        ecAlpha(ctx, GA, (1 - q) * 0.8);
        ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, r * q, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(el * 3 + i * 1.7) > 0.5;
        if (!on) continue;
        ecAlpha(ctx, GA, 0.9); ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(x + (ecHash(i) - 0.5) * r * 1.4, y + (ecHash(i + 9) - 0.5) * r * 1.4, 8, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'clockHands') {
      const rr = r * e;
      ecAlpha(ctx, GA, 0.3);
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      ecLine(ctx, x, y, x + Math.cos(el * 0.8) * rr * 0.55, y + Math.sin(el * 0.8) * rr * 0.55, white, 8);
      ecLine(ctx, x, y, x + Math.cos(el * 3.2) * rr * 0.82, y + Math.sin(el * 3.2) * rr * 0.82, acc, 4);

    } else if (id === 'gyroscope') {
      for (let i = 0; i < 3; i++) {
        ecAlpha(ctx, GA, 0.85 - i * 0.15);
        ctx.strokeStyle = i === 1 ? acc : col; ctx.lineWidth = 4;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(el * (0.6 + i * 0.4));
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * (0.28 + i * 0.14), i * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

    } else if (id === 'cometTrail') {
      const head = { x: x + Math.cos(el) * r, y: y + Math.sin(el) * r * 0.7 };
      for (let i = 1; i <= 16; i++) {
        ecAlpha(ctx, GA, (1 - i / 18) * 0.8);
        ctx.fillStyle = i % 5 === 0 ? acc : col;
        ctx.beginPath();
        ctx.arc(head.x - Math.cos(el) * i * 13, head.y - Math.sin(el) * i * 9, 14 * (1 - i / 20), 0, Math.PI * 2);
        ctx.fill();
      }
      ecAlpha(ctx, GA, 1); ctx.fillStyle = white;
      ctx.beginPath(); ctx.arc(head.x, head.y, 10, 0, Math.PI * 2); ctx.fill();

    } else if (id === 'pulseRings') {
      for (let i = 0; i < 4; i++) {
        const q = (el * 0.55 + i / 4) % 1;
        ecAlpha(ctx, GA, (1 - q) * 0.9);
        ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(x, y, r * q, 0, Math.PI * 2); ctx.stroke();
      }

    } else if (id === 'pendulumBalls') {
      const n = 5, gap = 42;
      for (let i = 0; i < n; i++) {
        const phase = Math.sin(el * 2.4 + i * 0.6);
        const bx = x + (i - 2) * gap;
        const by = y + phase * 26;
        ecAlpha(ctx, GA, 0.9);
        ecLine(ctx, bx, y - r, bx, by - 24, 'rgba(148,163,184,0.5)', 2);
        ctx.fillStyle = i === 2 ? acc : col;
        ctx.beginPath(); ctx.arc(bx, by, 22, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'vortexSpiral') {
      for (let arm = 0; arm < 4; arm++) {
        ecAlpha(ctx, GA, 0.85);
        ctx.strokeStyle = arm % 2 ? acc : col; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const q = i / 60;
          const ang = arm * Math.PI / 2 + q * Math.PI * 2.4 + el;
          const rad = r * q;
          const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    return;
  }

  /* ---- backgrounds ---- */
  if (EC2_BACKGROUND_IDS.indexOf(id) >= 0) {
    const base = ec2Base(p);
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    if (id === 'cityLightsBackground') {
      for (let i = 0; i < 14; i++) {
        const bh = 120 + ecHash(i * 3.7) * 420;
        ecAlpha(ctx, GA, 0.95);
        ctx.fillStyle = '#141F33';
        ctx.fillRect(i * (W / 14), H - bh, W / 14 - 6, bh);
        for (let w0 = 0; w0 < 6; w0++) {
          if (ecHash(i * 11 + w0) > 0.45) {
            ecAlpha(ctx, GA, 0.4 + 0.5 * ecHash(i * 5 + w0 * 3));
            ctx.fillStyle = ecHash(i + w0) > 0.5 ? acc : col;
            ctx.fillRect(i * (W / 14) + 10 + (w0 % 2) * 24, H - bh + 24 + Math.floor(w0 / 2) * 34, 12, 16);
          }
        }
      }
      ecAlpha(ctx, GA, 0.9);
      const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
      g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(4,7,15,0.9)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);

    } else if (id === 'underwaterBackground') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0B3B5A'); g.addColorStop(0.6, '#062238'); g.addColorStop(1, base);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        ecAlpha(ctx, GA, 0.18);
        ctx.strokeStyle = '#7DD3FC'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let j = 0; j <= 40; j++) {
          const px = (i / 8) * W + Math.sin(j * 0.4 + el + i) * 30;
          const py = (j / 40) * H;
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 40; i++) {
        const q = (el * 0.08 + ecHash(i * 3.3)) % 1;
        ecAlpha(ctx, GA, 0.5 * (1 - q));
        ctx.fillStyle = '#BAE6FD';
        ctx.beginPath(); ctx.arc(ecHash(i) * W, H - q * H, 3 + 6 * ecHash(i + 5), 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'lavaLampBackground') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const q = (el * 0.06 + i / 5) % 1;
        const bx = W * (0.2 + 0.6 * ecHash(i * 4.1));
        const by = H - q * H;
        const rr = 120 + 90 * ecHash(i * 7.7);
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, rr);
        g.addColorStop(0, (i % 2 ? acc : col) + 'AA');
        g.addColorStop(1, 'transparent');
        ecAlpha(ctx, GA, 0.7);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    } else if (id === 'nebulaBackground') {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 7; i++) {
        const bx = W * (0.15 + 0.7 * ecHash(i * 3.1)) + Math.sin(el * 0.2 + i) * 30;
        const by = H * (0.15 + 0.7 * ecHash(i * 8.3));
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, W * (0.22 + 0.2 * ecHash(i + 2)));
        g.addColorStop(0, [col, acc, '#8B5CF6'][i % 3] + '66');
        g.addColorStop(1, 'transparent');
        ecAlpha(ctx, GA, 0.8);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

    } else if (id === 'plaidBackground') {
      for (let i = 0; i < 18; i++) {
        ecAlpha(ctx, GA, 0.1 + 0.08 * (i % 3));
        ctx.fillStyle = i % 2 ? col : acc;
        ctx.fillRect(0, i * (H / 18), W, H / 36);
        ctx.fillRect(i * (W / 18), 0, W / 36, H);
      }

    } else if (id === 'circuitBoardBackground') {
      for (let i = 0; i < 26; i++) {
        const px = ecHash(i * 3.3) * W, py = ecHash(i * 7.1) * H;
        const len = 80 + ecHash(i * 2.2) * 220;
        ecAlpha(ctx, GA, 0.35);
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (i % 2 ? len : 0), py + (i % 2 ? 0 : len));
        ctx.stroke();
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = i % 3 === 0 ? acc : col;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'paperTextureBackground') {
      ecAlpha(ctx, GA, 0.75);
      ctx.strokeStyle = 'rgba(203,213,225,0.55)';
      for (let i = 0; i < 220; i++) {
        const px = ecHash(i * 1.9) * W, py = ecHash(i * 6.7) * H;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 14 + 26 * ecHash(i), py + 4); ctx.stroke();
      }
      for (let i = 1; i < 4; i++) {
        ecAlpha(ctx, GA, 0.3);
        ecLine(ctx, 0, (i / 4) * H, W, (i / 4) * H + 8, 'rgba(148,163,184,0.5)', 2);
      }
      ecAlpha(ctx, GA, 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 520; i++) ctx.fillRect(ecHash(i * 4.1) * W, ecHash(i * 9.9) * H, 2, 2);

    } else if (id === 'marbleBackground') {
      for (let i = 0; i < 7; i++) {
        ecAlpha(ctx, GA, 0.35);
        ctx.strokeStyle = i % 2 ? acc : 'rgba(226,232,240,0.6)';
        ctx.lineWidth = 2 + (i % 3);
        ctx.beginPath();
        for (let j = 0; j <= 60; j++) {
          const px = (j / 60) * W;
          const py = H * (0.08 + i * 0.14) + Math.sin(j * 0.35 + i * 1.7 + el * 0.2) * (40 + i * 12);
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

    } else if (id === 'foamBackground') {
      for (let i = 0; i < 60; i++) {
        const px = ecHash(i * 3.7) * W;
        const py = H - ((el * 8 + ecHash(i * 5.3) * H) % H);
        const rr = 8 + 22 * ecHash(i + 3);
        ecAlpha(ctx, GA, 0.12 + 0.2 * ecHash(i + 7));
        ctx.fillStyle = '#E0F2FE';
        ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(224,242,254,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      }

    } else if (id === 'hexTunnelBackground') {
      const step = (el * 0.12) % 1;
      for (let i = 0; i < 10; i++) {
        const q = (i / 10 + step) % 1;
        const rr = (0.05 + q * 0.9) * W * 0.7;
        ecAlpha(ctx, GA, Math.sin(q * Math.PI) * 0.6);
        ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 3;
        ecHex(ctx, W / 2, H / 2, rr);
        ctx.stroke();
      }

    } else if (id === 'vortexBackground') {
      for (let arm = 0; arm < 10; arm++) {
        ecAlpha(ctx, GA, 0.3);
        ctx.strokeStyle = arm % 2 ? acc : col; ctx.lineWidth = 5;
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const q = i / 50;
          const ang = arm * Math.PI / 5 + q * Math.PI * 3 + el * 0.6;
          const rad = q * W * 0.6;
          const px = W / 2 + Math.cos(ang) * rad, py = H / 2 + Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

    } else if (id === 'confettiWallBackground') {
      for (let i = 0; i < 90; i++) {
        const px = ecHash(i * 2.9) * W;
        const py = (ecHash(i * 6.1) * H + el * (20 + 40 * ecHash(i))) % H;
        ecAlpha(ctx, GA, 0.35 + 0.4 * ecHash(i + 4));
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(el * ecHash(i + 2) + i);
        ctx.fillStyle = [col, acc, '#8B5CF6', '#34D399'][i % 4];
        ctx.fillRect(-8, -4, 16, 8);
        ctx.restore();
      }
    }
    return;
  }

  /* ---- effects ---- */
  if (EC2_EFFECT_IDS.indexOf(id) >= 0) {
    if (id === 'rainEffect') {
      for (let i = 0; i < 140; i++) {
        const q = (el * 0.8 + ecHash(i * 3.3)) % 1;
        const px = ecHash(i * 7.7) * W + q * 40;
        const py = q * H;
        ecAlpha(ctx, GA, 0.35);
        ecLine(ctx, px, py, px - 14, py + 46, '#BAE6FD', 2);
      }

    } else if (id === 'snowEffect') {
      for (let i = 0; i < 110; i++) {
        const q = (el * 0.18 + ecHash(i * 4.1)) % 1;
        const px = ecHash(i * 8.3) * W + Math.sin(el + i) * 24;
        const py = q * H;
        ecAlpha(ctx, GA, 0.5);
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath(); ctx.arc(px, py, 3 + 4 * ecHash(i + 2), 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'dustMotes') {
      for (let i = 0; i < 60; i++) {
        const q = (el * 0.1 + ecHash(i * 5.9)) % 1;
        const px = ecHash(i * 2.3) * W + Math.sin(el * 0.5 + i) * 40;
        const py = H - q * H;
        ecAlpha(ctx, GA, 0.3 + 0.3 * ecHash(i + 1));
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(px, py, 3 + 5 * ecHash(i + 6), 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'fogLayer') {
      for (let i = 0; i < 6; i++) {
        const y0 = H * (0.2 + i * 0.13) + Math.sin(el * 0.4 + i) * 20;
        const g = ctx.createLinearGradient(0, y0 - 120, 0, y0 + 120);
        g.addColorStop(0, 'transparent');
        g.addColorStop(0.5, 'rgba(226,232,240,0.14)');
        g.addColorStop(1, 'transparent');
        ecAlpha(ctx, GA, 0.8);
        ctx.fillStyle = g; ctx.fillRect(0, y0 - 120, W, 240);
      }

    } else if (id === 'bokehBurst') {
      for (let i = 0; i < 22; i++) {
        const q = (el * 0.18 + ecHash(i * 3.9)) % 1;
        const bx = ecHash(i * 6.1) * W;
        const by = H - q * H;
        const rr = 30 + 60 * ecHash(i + 4);
        const g = ctx.createRadialGradient(bx, by, 2, bx, by, rr);
        g.addColorStop(0, (i % 2 ? acc : col) + '55');
        g.addColorStop(1, 'transparent');
        ecAlpha(ctx, GA, 0.6);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
      }

    } else if (id === 'lensFlare') {
      const fx = W * (0.3 + 0.2 * Math.sin(el * 0.4)), fy = H * 0.3;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ecAlpha(ctx, GA, 0.8);
      ecLine(ctx, 0, fy, W, fy + 40, 'rgba(255,255,255,0.35)', 3);
      for (let i = 0; i < 6; i++) {
        const q = i / 6;
        const g = ctx.createRadialGradient(fx + (W / 2 - fx) * q * 2, fy + 40 * q, 2, fx + (W / 2 - fx) * q * 2, fy + 40 * q, 30 + 26 * i);
        g.addColorStop(0, i % 2 ? acc + '88' : col + '88');
        g.addColorStop(1, 'transparent');
        ecAlpha(ctx, GA, 0.5);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx + (W / 2 - fx) * q * 2, fy + 40 * q, 30 + 26 * i, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    } else if (id === 'prismSplit') {
      const sh = 34 + 12 * Math.sin(el * 1.4);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const lg = ctx.createLinearGradient(0, 0, sh * 3, 0);
      lg.addColorStop(0, '#FF3355'); lg.addColorStop(1, 'transparent');
      ecAlpha(ctx, GA, 0.55); ctx.fillStyle = lg; ctx.fillRect(0, 0, sh * 3, H);
      const rg = ctx.createLinearGradient(W, 0, W - sh * 3, 0);
      rg.addColorStop(0, '#33E0FF'); rg.addColorStop(1, 'transparent');
      ecAlpha(ctx, GA, 0.55); ctx.fillStyle = rg; ctx.fillRect(W - sh * 3, 0, sh * 3, H);
      for (let i = 0; i < 6; i++) {
        ecAlpha(ctx, GA, 0.3);
        ecLine(ctx, 0, (i + 0.5) * H / 6, W, (i + 0.5) * H / 6, i % 2 ? '#FF3355' : '#33E0FF', 2);
      }
      ctx.restore();

    } else if (id === 'neonEdge') {
      ecAlpha(ctx, GA, 0.9);
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 26;
      ctx.strokeStyle = col; ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.restore();

    } else if (id === 'scanSweep') {
      const sy = ((el * 0.35) % 1) * H;
      const g = ctx.createLinearGradient(0, sy - 80, 0, sy + 80);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, col + '55');
      g.addColorStop(1, 'transparent');
      ecAlpha(ctx, GA, 0.9);
      ctx.fillStyle = g; ctx.fillRect(0, sy - 80, W, 160);
      ecLine(ctx, 0, sy, W, sy, acc, 2);

    } else if (id === 'bloomRays') {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + el * 0.2;
        const g = ctx.createLinearGradient(W / 2, H * 0.4, W / 2 + Math.cos(ang) * W, H * 0.4 + Math.sin(ang) * W);
        g.addColorStop(0, col + '44'); g.addColorStop(1, 'transparent');
        ecAlpha(ctx, GA, 0.35);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(W / 2, H * 0.4);
        ctx.lineTo(W / 2 + Math.cos(ang - 0.04) * W, H * 0.4 + Math.sin(ang - 0.04) * W);
        ctx.lineTo(W / 2 + Math.cos(ang + 0.04) * W, H * 0.4 + Math.sin(ang + 0.04) * W);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

    } else if (id === 'retroTv') {
      ecAlpha(ctx, GA, 0.25);
      ctx.fillStyle = '#000';
      for (let i = 0; i < 40; i++) ctx.fillRect(0, i * (H / 40), W, 4);
      ecAlpha(ctx, GA, 0.35);
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 300; i++) {
        const n = i + Math.floor(el * 20);
        ctx.fillRect(ecHash(n * 1.7) * W, ecHash(n * 5.3) * H, 3, 2);
      }
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ecAlpha(ctx, GA, 0.9);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    } else if (id === 'shadowVignette') {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.4, H * 0.2, W * 0.5, H * 0.4, H * 0.85);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, 'rgba(2,4,10,0.72)');
      ecAlpha(ctx, GA, 1);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    return;
  }

  /* ---- transitions ---- */
  if (EC2_TRANSITION_IDS.indexOf(id) >= 0) {
    const k = Math.sin(ecClamp(prog, 0, 1) * Math.PI);
    const dark = ecS(p.color, '#04070F');
    if (id === 'transitionFold') {
      const cols = 6, cw = W / cols;
      for (let i = 0; i < cols; i++) {
        ecAlpha(ctx, GA, 0.95);
        ctx.fillStyle = i % 2 ? dark : '#0B1220';
        ctx.fillRect(i * cw, 0, cw * (1 - k) + 1, H);
      }

    } else if (id === 'transitionFlip') {
      const topH = (H / 2) * (1 - k);
      ecAlpha(ctx, GA, 0.95); ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W, topH);
      ctx.fillRect(0, H - topH, W, topH);
      ecLine(ctx, 0, topH, W, topH, acc, 4);
      ecLine(ctx, 0, H - topH, W, H - topH, acc, 4);

    } else if (id === 'transitionSpin') {
      const rr = Math.min(W, H) * 0.75 * k;
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(prog * Math.PI);
      ecAlpha(ctx, GA, 0.9); ctx.fillStyle = dark;
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ecAlpha(ctx, GA, 0.95); ctx.strokeStyle = acc; ctx.lineWidth = 5;
      ctx.strokeRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();

    } else if (id === 'transitionMosaic') {
      const cols = 8, rows = 14, cw = W / cols, ch = H / rows;
      for (let r0 = 0; r0 < rows; r0++) for (let c0 = 0; c0 < cols; c0++) {
        const dd = Math.hypot(c0 / cols - 0.5, r0 / rows - 0.5);
        if (dd < k * 0.8) {
          ecAlpha(ctx, GA, 0.9);
          ctx.fillStyle = (r0 * cols + c0) % 5 === 0 ? acc : dark;
          ctx.fillRect(c0 * cw, r0 * ch, cw + 1, ch + 1);
        }
      }

    } else if (id === 'transitionClockWipe') {
      ecAlpha(ctx, GA, 0.96); ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2);
      ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.closePath(); ctx.fill();
      ecAlpha(ctx, GA, 1); ctx.strokeStyle = acc; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.72, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      const edge = -Math.PI / 2 + k * Math.PI * 2;
      ecLine(ctx, W / 2, H / 2, W / 2 + Math.cos(edge) * Math.hypot(W, H), H / 2 + Math.sin(edge) * Math.hypot(W, H), acc, 8);

    } else if (id === 'transitionDiagonalWipe') {
      ecAlpha(ctx, GA, 0.95); ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(0, H - H * 1.4 * k);
      ctx.lineTo(W, H - H * 1.4 * k - W * 0.4);
      ctx.lineTo(W, H); ctx.lineTo(0, H);
      ctx.closePath(); ctx.fill();
      ecLine(ctx, 0, H - H * 1.4 * k, W, H - H * 1.4 * k - W * 0.4, acc, 6);

    } else if (id === 'transitionSplitWipe') {
      ecAlpha(ctx, GA, 0.95); ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W * k, H);
      ctx.fillRect(W - W * k, 0, W * k, H);
      ecAlpha(ctx, GA, 1);
      ecLine(ctx, W * k, 0, W * k, H, acc, 5);
      ecLine(ctx, W - W * k, 0, W - W * k, H, acc, 5);

    } else if (id === 'transitionZoomIn') {
      const rr = Math.min(W, H) * 0.75 * k;
      ecAlpha(ctx, GA, 0.95); ctx.fillStyle = dark;
      ctx.fillRect(W / 2 - rr, H / 2 - rr, rr * 2, rr * 2);
      ecAlpha(ctx, GA, 1); ctx.strokeStyle = acc; ctx.lineWidth = 5;
      ctx.strokeRect(W / 2 - rr, H / 2 - rr, rr * 2, rr * 2);

    } else if (id === 'transitionZoomOut') {
      const rr = Math.min(W, H) * 0.9 * (1 - k);
      ecAlpha(ctx, GA, 0.95); ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W, H);
      ecAlpha(ctx, GA, 0.25);
      ctx.clearRect ? null : null;
      ctx.fillStyle = ecS(p.background, '#04070F');
      ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, Math.PI * 2); ctx.fill();
      ecAlpha(ctx, GA, 1); ctx.strokeStyle = acc; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, Math.PI * 2); ctx.stroke();

    } else if (id === 'transitionShutter') {
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ecAlpha(ctx, GA, 0.95);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(ang);
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Math.hypot(W, H), 0, Math.PI / 3); ctx.closePath(); ctx.fill();
        ecAlpha(ctx, GA, 0.5);
        ctx.strokeStyle = acc; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.hypot(W, H), 0); ctx.stroke();
        ctx.restore();
      }
      ecAlpha(ctx, GA, 0.2 * k);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H), 0, Math.PI * 2); ctx.fill();

    } else if (id === 'transitionWaterRipple') {
      for (let i = 0; i < 4; i++) {
        const q = (k * 0.9 + i / 4) % 1;
        ecAlpha(ctx, GA, (1 - q) * 0.5);
        ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(W / 2, H * 0.5, q * W * 0.8, 0, Math.PI * 2); ctx.stroke();
      }

    } else if (id === 'transitionLumaFade') {
      // A luma fade ramps the whole frame through a bright value and back,
      // peaking at the cut. The old banded version alternated black/white at
      // 16 % alpha: it could only produce a translucent grey wash (and never
      // covered the scene change), and painting opaque bands instead left a
      // hard-edged curtain slicing across the new shot.
      const col = ecS(p.color, '#FFFFFF');
      ecAlpha(ctx, GA, k);
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }

  /* ---- lottie-style ---- */
  if (EC2_LOTTIE_IDS.indexOf(id) >= 0) {
    if (id === 'lottieArrowFlow') {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const q = (el * 0.6 + i / n) % 1;
        ecAlpha(ctx, GA, Math.sin(q * Math.PI));
        const phase = q * Math.PI * 2;
        const px = x - W * 0.28 + q * W * 0.56;
        const py = y + Math.sin(phase) * 40;
        const tangent = Math.atan2(Math.cos(phase) * 40 * Math.PI * 2, W * 0.56);
        ec2Arrow(ctx, px, py, tangent, 30, i % 2 ? acc : col);
      }

    } else if (id === 'lottiePulseRings') {
      for (let i = 0; i < 3; i++) {
        const q = (el * 0.55 + i / 3) % 1;
        ecAlpha(ctx, GA, (1 - q) * 0.9);
        ctx.strokeStyle = i === 1 ? acc : col; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(x, y, 30 + q * Math.min(W, H) * 0.32, 0, Math.PI * 2); ctx.stroke();
      }
      ecAlpha(ctx, GA, 1); ctx.fillStyle = white;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();

    } else if (id === 'lottieBarReveal') {
      const n = 5, bw = 62, gap = 20, total = n * bw + (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        const q = ecClamp((prog - i * 0.12) / 0.4, 0, 1);
        const bh = (80 + 90 * ecHash(i + 2)) * icEase(q);
        ecAlpha(ctx, GA, 0.95);
        ctx.fillStyle = i % 2 ? acc : col;
        ecRound(ctx, x - total / 2 + i * (bw + gap), y + 120 - bh, bw, bh, 10); ctx.fill();
      }

    } else if (id === 'lottieConfetti') {
      for (let i = 0; i < 50; i++) {
        const q = (el * 0.35 + ecHash(i * 3.1)) % 1;
        const px = x + (ecHash(i * 7.7) - 0.5) * W * 0.6;
        const py = y - 100 + q * 260;
        if (py > y + 150) continue;
        ctx.save(); ctx.translate(px, py); ctx.rotate(el * 2 + i);
        ecAlpha(ctx, GA, 0.9);
        ctx.fillStyle = [col, acc, '#8B5CF6', '#34D399'][i % 4];
        ctx.fillRect(-6, -3, 12, 6);
        ctx.restore();
      }

    } else if (id === 'lottieCheckmark') {
      const rr = ecN(p.radius, 90);
      ecAlpha(ctx, GA, 1);
      ctx.strokeStyle = col; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      const q = ecClamp((prog - 0.2) / 0.6, 0, 1);
      ctx.strokeStyle = acc; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - rr * 0.4, y);
      ctx.lineTo(x - rr * 0.08, y + rr * 0.3);
      ctx.lineTo(x - rr * 0.4 + rr * 0.9 * q, y + rr * 0.3 - rr * 0.65 * q);
      ctx.stroke();

    } else if (id === 'lottieTextPop') {
      const t2 = ecS(p.text, ecS(p.title, ''));
      if (!t2) { ecSkeleton(ctx, x, y, 64, GA, col); return; }
      for (let i = 0; i < 3; i++) {
        const q = ecClamp(prog * 3 - i, 0, 1);
        ecAlpha(ctx, GA, q);
        ecText(ctx, t2, x, y + (i - 1) * 70 - (1 - q) * 40, 54 * (0.6 + 0.4 * q), i === 1 ? acc : white, 'center', 900);
      }
    }
    return;
  }

  ecSkeleton(ctx, x, y, size, GA, col);
}


function drawExtraComponent(ctx, W, H, time, prog, c, p, GA) {
  const id = c.componentId;
  const T0 = (typeof T !== 'undefined' && T) ? T : {};
  const col = ecS(p.color, ecS(p.accentColor, ecS(T0.accent, '#38BDF8')));
  const acc = ecS(p.accentColor, ecS(T0.accent2, '#FFD54A'));
  const el = Math.max(0, time - ecN(c.start, 0));
  ctx.save();
  try {
    if (EC3_COMPONENT_SET.has(id)) {
      /* transform ids move the whole stage; sharedSceneTransforms applies them */
      if (EC3_TRANSFORM_IDS.indexOf(id) < 0) drawPack3(ctx, W, H, el, prog, id, p, GA, col, acc);
    }
    else if (EC2_COMPONENT_SET.has(id)) {
      /* transform ids move the whole stage; sharedSceneTransforms applies them */
      if (EC2_TRANSFORM_IDS.indexOf(id) < 0) drawPack2(ctx, W, H, el, prog, id, p, GA, col, acc);
    }
    else if (EC_TRANSITION_IDS.indexOf(id) >= 0) ecTransition(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_BACKGROUND_IDS.indexOf(id) >= 0) ecBackground(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_EFFECT_IDS.indexOf(id) >= 0) ecEffect(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_TITLE_IDS.indexOf(id) >= 0) ecTitle(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_CAPTION_IDS.indexOf(id) >= 0) ecCaption(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_CHART_IDS.indexOf(id) >= 0) ecChart(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_UI_IDS.indexOf(id) >= 0) ecUi(ctx, W, H, el, prog, id, p, GA, col, acc);
    else if (EC_MOTION_IDS.indexOf(id) >= 0) ecMotion(ctx, W, H, el, prog, id, p, GA, col, acc);
    else ecShape(ctx, W, H, el, prog, id, p, GA, col, acc);
  } finally {
    ctx.restore();
  }
}
