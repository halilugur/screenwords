/* Third pack: titles (25). */
function p3Title(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.16);
  const x = a.x, y = a.y;
  const sz = ecN(p.size, 72);
  const text = p3TextOf(p);
  const sub = p3SubOf(p);
  const e = icEase(prog);
  const white = '#F4F8FF';
  if (!text) { ecSkeleton(ctx, x, y, sz, GA, col); return; }
  ecFont(ctx, sz, 900);
  const tw = Math.max(sz * 2, ctx.measureText(text).width);

  if (id === 'auroraHeadline') {
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 38;
    ctx.fillStyle = ecGrad(ctx, x - tw / 2, y - sz / 2, x + tw / 2, y + sz / 2,
      [[0, col], [0.55, acc], [1, white]]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = ecClamp(GA * e, 0, 1);
    ctx.fillText(text, x, y);
    ctx.restore();
    ecAlpha(ctx, GA, 0.6 * e);
    ecLine(ctx, x - tw / 2, y + sz * 0.72, x - tw / 2 + tw * e, y + sz * 0.72, acc, 3);

  } else if (id === 'chromeTitle') {
    const g = ctx.createLinearGradient(0, y - sz * 0.55, 0, y + sz * 0.55);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.42, col);
    g.addColorStop(0.5, '#94A3B8');
    g.addColorStop(0.58, col);
    g.addColorStop(1, '#0F172A');
    ecAlpha(ctx, GA, e);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = g;
    ctx.fillText(text, x, y);
    ecAlpha(ctx, GA, 0.5 * e);
    ecLine(ctx, x - tw / 2, y - sz * 0.56, x + tw / 2, y - sz * 0.56, '#FFFFFF', 2);

  } else if (id === 'neonUnderlineTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 900);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 18;
    const segs = 9, sw = (tw / segs) * 0.66;
    for (let i = 0; i < segs; i++) {
      ctx.strokeStyle = i % 2 ? acc : col;
      ctx.lineWidth = 5;
      const sx = x - tw / 2 + (i + 0.17) * (tw / segs);
      ctx.beginPath(); ctx.moveTo(sx, y + sz * 0.66); ctx.lineTo(sx + sw, y + sz * 0.66); ctx.stroke();
    }
    ctx.restore();

  } else if (id === 'splitFlapTitle') {
    ecFont(ctx, sz, 900);
    const chars = Array.from(String(text));
    let cx = x - tw / 2;
    for (let i = 0; i < chars.length; i++) {
      const w = ctx.measureText(chars[i]).width;
      const q = ecClamp((prog - i * 0.025) / 0.32, 0, 1);
      const flip = Math.max(0.04, Math.abs(Math.cos(q * Math.PI * 0.5)));
      ctx.save();
      ctx.translate(cx + w / 2, y);
      ctx.scale(1, flip);
      ecText(ctx, chars[i], 0, 0, sz, i % 2 ? acc : white, 'center', 900);
      ctx.restore();
      ecAlpha(ctx, GA, 0.18);
      ecLine(ctx, cx, y + sz * 0.52, cx + w, y + sz * 0.52, col, 1);
      cx += w;
    }

  } else if (id === 'glassTitle') {
    const bw = tw + 92, bh = sz * 1.55;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 22, 'rgba(8,14,26,0.52)', 'rgba(255,255,255,0.34)', 2);
    ecPanel(ctx, x - bw / 2 + 8, y - bh / 2 + 8, bw - 16, bh - 16, 16, null, 'rgba(255,255,255,0.10)', 1);
    ecText(ctx, text, x, y, sz * 0.82, white, 'center', 900);

  } else if (id === 'outlineShadowTitle') {
    ecAlpha(ctx, GA, 0.35 * e);
    ecText(ctx, text, x + 10, y + 12, sz, acc, 'center', 900);
    ecAlpha(ctx, GA, 0.22 * e);
    ecText(ctx, text, x - 10, y - 12, sz, col, 'center', 900);
    ctx.save();
    ecFont(ctx, sz, 900);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, sz * 0.035);
    ctx.strokeStyle = white;
    ctx.globalAlpha = ecClamp(GA * e, 0, 1);
    ctx.strokeText(text, x, y);
    ctx.restore();

  } else if (id === 'gradientSweepTitle') {
    const shift = (p3Loop(el * 0.22) - 0.5) * tw;
    const g = ctx.createLinearGradient(x - tw / 2 + shift, y, x + tw / 2 + shift, y);
    g.addColorStop(0, col); g.addColorStop(0.45, white); g.addColorStop(1, acc);
    ctx.save();
    ctx.fillStyle = g;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = ecClamp(GA * e, 0, 1);
    ctx.fillText(text, x, y);
    ctx.restore();

  } else if (id === 'kineticStackTitle') {
    const parts = String(text).split(/\s+/).slice(0, 3);
    for (let i = 0; i < parts.length; i++) {
      const q = icEase(ecClamp((prog - i * 0.14) / 0.5, 0, 1));
      ecAlpha(ctx, GA, q);
      ecText(ctx, parts[i], x + (i % 2 ? sz * 0.7 : -sz * 0.7), y + (i - (parts.length - 1) / 2) * sz * 1.02,
        sz * (0.78 + 0.22 * q), i % 2 ? acc : white, 'center', 900);
    }

  } else if (id === 'ribbonBannerTitle') {
    const bw = tw + 140, bh = sz * 1.4;
    ecAlpha(ctx, GA, e);
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, y);
    ctx.lineTo(x - bw / 2 + 34, y - bh / 2);
    ctx.lineTo(x + bw / 2 - 34, y - bh / 2);
    ctx.lineTo(x + bw / 2, y);
    ctx.lineTo(x + bw / 2 - 34, y + bh / 2);
    ctx.lineTo(x - bw / 2 + 34, y + bh / 2);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.18 * GA; ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ecText(ctx, text, x, y, sz * 0.68, p3Ink(col), 'center', 900);
    ecAlpha(ctx, GA, 0.8);
    ecLine(ctx, x - bw / 2 + 40, y - bh / 2 + 8, x + bw / 2 - 40, y - bh / 2 + 8, acc, 2);

  } else if (id === 'typewriterBlockTitle') {
    const n = Math.floor(ecClamp(prog, 0, 1) * text.length);
    ecAlpha(ctx, GA, 1);
    ecText(ctx, text.slice(0, n), x, y, sz, white, 'center', 800);
    if (Math.floor(el * 2) % 2 === 0 && n < text.length) {
      ecFont(ctx, sz, 800);
      const wid = ctx.measureText(text.slice(0, n)).width;
      const full = ctx.measureText(text).width;
      ecLine(ctx, x - full / 2 + wid + 5, y - sz * 0.48, x - full / 2 + wid + 5, y + sz * 0.48, acc, sz * 0.12);
    }

  } else if (id === 'spotlightRevealTitle') {
    const rad = Math.max(tw, sz * 3) * (0.7 + 0.3 * e);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.save();
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 900);
    ecAlpha(ctx, GA, 0.6 * e);
    ecLine(ctx, x - tw / 2, y + sz * 0.64, x + tw / 2, y + sz * 0.64, acc, 4);

  } else if (id === 'glitchSliceTitle') {
    const slices = 8;
    for (let i = 0; i < slices; i++) {
      const sy = y - sz * 0.7 + i * (sz * 1.4 / slices);
      const off = (ecHash(i + Math.floor(el * 12)) - 0.5) * 30 * (1 - prog * 0.6);
      ecAlpha(ctx, GA, e);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, sy, W, sz * 1.4 / slices); ctx.clip();
      ecText(ctx, text, x + off + (i % 2 ? 6 : -6), y, sz, i % 3 === 0 ? '#FF3355' : (i % 3 === 1 ? '#33E0FF' : white), 'center', 900);
      ctx.restore();
    }

  } else if (id === 'curvedArcTitle') {
    const chars = Array.from(String(text));
    const step = Math.min(sz * 0.72, tw / Math.max(1, chars.length));
    let cx = x - (chars.length - 1) * step / 2;
    for (let i = 0; i < chars.length; i++) {
      const t = (i / Math.max(1, chars.length - 1)) - 0.5;
      const yy = y + Math.sin(t * Math.PI) * sz * 0.5;
      ecAlpha(ctx, GA, e);
      ecText(ctx, chars[i], cx, yy, sz * 0.86, i % 2 ? acc : white, 'center', 900);
      cx += step;
    }

  } else if (id === 'countdownHeadline') {
    const from = ecN(p.from, 10);
    const remain = Math.max(0, from * (1 - prog));
    ecAlpha(ctx, GA, 1);
    ecText(ctx, String(Math.ceil(remain)), x, y - sz * 0.1, sz * 2.1, col, 'center', 900);
    ecText(ctx, text, x, y + sz * 1.05, sz * 0.46, white, 'center', 800);
    ecAlpha(ctx, GA, 0.7);
    ecLine(ctx, x - tw / 2, y + sz * 1.42, x - tw / 2 + tw * (1 - remain / Math.max(1, from)), y + sz * 1.42, acc, 5);

  } else if (id === 'boldStatementTitle') {
    const lines = ecWrap(ctx, text, W * 0.82, sz, 900).slice(0, 3);
    const lh = sz * 1.02;
    for (let i = 0; i < lines.length; i++) {
      ecAlpha(ctx, GA, e);
      ecText(ctx, lines[i], x, y + (i - (lines.length - 1) / 2) * lh, sz, white, 'center', 900);
    }
    if (sub) { ecText(ctx, sub, x, y + (lines.length / 2) * lh + sz * 0.4, sz * 0.3, acc, 'center', 700); }

  } else if (id === 'minimalKickerTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, sub || 'FEATURE', x, y - sz * 0.85, sz * 0.24, acc, 'center', 700);
    ecText(ctx, text, x, y, sz * 0.94, white, 'center', 800);
    ecAlpha(ctx, GA, 0.55);
    ecLine(ctx, x - tw / 3, y + sz * 0.66, x + tw / 3, y + sz * 0.66, col, 2);

  } else if (id === 'magazineCoverTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, ecS(p.label, 'ISSUE 01'), x - tw / 2, y - sz * 1.05, sz * 0.2, acc, 'left', 700);
    ecText(ctx, text, x, y, sz, white, 'center', 900);
    ecText(ctx, sub, x - tw / 2, y + sz * 0.82, sz * 0.22, col, 'left', 600);
    ecLine(ctx, x - tw / 2, y + sz * 0.62, x + tw / 2, y + sz * 0.62, white, 2);

  } else if (id === 'verticalMarqueeTitle') {
    const dy = (el * 80) % (sz * 1.4);
    ctx.save();
    ctx.beginPath(); ctx.rect(x - tw / 2, y - sz * 1.2, tw, sz * 2.4); ctx.clip();
    for (let i = -2; i < 5; i++) {
      ecAlpha(ctx, GA, 0.25 + 0.75 * Math.max(0, 1 - Math.abs(i * sz * 1.4 - dy) / (sz * 2.4)));
      ecText(ctx, text, x, y + i * sz * 1.4 + dy, sz * 0.52, i % 2 ? acc : white, 'center', 900);
    }
    ctx.restore();

  } else if (id === 'dualToneTitle') {
    const words = String(text).split(/\s+/);
    ecFont(ctx, sz, 900);
    let total = 0;
    const widths = words.map(w => { const wd = ctx.measureText(w).width; total += wd; return wd; });
    total += Math.max(0, words.length - 1) * sz * 0.26;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      ecAlpha(ctx, GA, e);
      ctx.font = '900 ' + Math.round(sz) + 'px ' + EC_FONT;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = i % 2 ? acc : white;
      ctx.fillText(words[i], cx, y);
      cx += widths[i] + sz * 0.26;
    }

  } else if (id === 'neonFlickerTitle') {
    const flick = 0.78 + 0.22 * Math.sin(el * 19) * Math.sin(el * 4.3);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 26 + 18 * flick;
    ctx.lineWidth = 3; ctx.strokeStyle = col;
    ecFont(ctx, sz, 900);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = ecClamp(GA * flick, 0, 1);
    ctx.strokeText(text, x, y);
    ctx.shadowBlur = 50;
    ctx.fillStyle = white;
    ctx.globalAlpha = ecClamp(GA * 0.9 * flick, 0, 1);
    ctx.fillText(text, x, y);
    ctx.restore();

  } else if (id === 'embossTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x - 3, y - 3, sz, 'rgba(255,255,255,0.75)', 'center', 900);
    ecText(ctx, text, x + 3, y + 3, sz, 'rgba(0,0,0,0.65)', 'center', 900);
    ecText(ctx, text, x, y, sz, white, 'center', 900);
    ecAlpha(ctx, GA, 0.45);
    ecLine(ctx, x - tw / 2, y + sz * 0.62, x + tw / 2, y + sz * 0.62, col, 2);

  } else if (id === 'scatterTitle') {
    const chars = Array.from(String(text));
    const step = Math.min(sz * 0.7, tw / Math.max(1, chars.length));
    let cx = x - (chars.length - 1) * step / 2;
    for (let i = 0; i < chars.length; i++) {
      const q = icEase(ecClamp((prog - i * 0.02) / 0.5, 0, 1));
      const ox = (ecHash(i + 3) - 0.5) * 220 * (1 - q);
      const oy = (ecHash(i + 17) - 0.5) * 160 * (1 - q);
      const rot = (ecHash(i + 31) - 0.5) * 1.6 * (1 - q);
      ctx.save();
      ctx.translate(cx + ox, y + oy);
      ctx.rotate(rot);
      ecAlpha(ctx, GA, q);
      ecText(ctx, chars[i], 0, 0, sz * 0.86, i % 2 ? acc : white, 'center', 900);
      ctx.restore();
      cx += step;
    }

  } else if (id === 'underlineDrawTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 900);
    const q = icEase(ecClamp((prog - 0.25) / 0.55, 0, 1));
    ecAlpha(ctx, GA, 0.95);
    ecLine(ctx, x - (tw / 2) * q, y + sz * 0.66, x + (tw / 2) * q, y + sz * 0.66, acc, 8);

  } else if (id === 'badgeRibbonTitle') {
    const bw = tw + 110, bh = sz * 1.28;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, bh / 2, 'rgba(5,10,20,0.78)', col, 3);
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 + 26, y - bh / 2);
    ctx.lineTo(x - bw / 2 + 26, y + bh / 2);
    ctx.lineTo(x - bw / 2 - 18, y + bh / 2 + 16);
    ctx.lineTo(x - bw / 2 - 18, y - bh / 2 + 16);
    ctx.closePath(); ctx.fill();
    ecText(ctx, text, x + 12, y, sz * 0.62, white, 'center', 900);

  } else if (id === 'cinematicTitle') {
    const band = sz * 0.12;
    ctx.fillStyle = 'rgba(2,5,12,0.82)';
    ctx.fillRect(0, 0, W, band);
    ctx.fillRect(0, H - band, W, band);
    ecAlpha(ctx, GA, e);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.round(sz) + 'px ' + EC_FONT;
    if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(sz * 0.08) + 'px';
    ctx.fillStyle = white;
    ctx.fillText(text, x, y);
    ctx.restore();
    ecAlpha(ctx, GA, 0.7);
    ecLine(ctx, x - tw / 2, y + sz * 0.7, x + tw / 2, y + sz * 0.7, acc, 2);
  }
}
