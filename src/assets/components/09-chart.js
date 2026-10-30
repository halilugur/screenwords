/* Third pack: charts (25). */
function p3Chart(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const fw = Math.min(W * 0.78, 760);
  const fh = Math.min(H * 0.46, 520);
  const bx = x - fw / 2, by = y - fh / 2;
  const e = icEase(prog);
  const colors = [col, acc, '#8B5CF6', '#34D399', '#F472B6', '#FBBF24'];
  const it = n => p3Items(p, n, colors);
  const maxOf = arr => Math.max(1, ...arr.map(o => Math.abs(ecN(o.value, 1))));
  const white = '#F4F8FF';
  const axis = 'rgba(255,255,255,0.22)';
  const label = p3TextOf(p);

  if (id === 'areaStackChart') {
    const data = it(5), mx = maxOf(data);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(ecN(data[i].value, 1)) / mx;
      ctx.beginPath();
      ctx.moveTo(bx, by + fh);
      for (let k = 0; k <= 24; k++) {
        const q = k / 24;
        const yy = by + fh - v * fh * (0.35 + 0.65 * q) * e;
        ctx.lineTo(bx + q * fw, yy);
      }
      ctx.lineTo(bx + fw, by + fh); ctx.closePath();
      ctx.fillStyle = data[i].color; ctx.globalAlpha = ecClamp(GA * 0.32, 0, 1); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = data[i].color; ctx.lineWidth = 2; ctx.stroke();
    }

  } else if (id === 'barRaceChart') {
    const data = it(5), mx = maxOf(data);
    const bh = fh / (data.length * 1.5);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(ecN(data[i].value, 1)) / mx;
      const q = icEase(ecClamp((prog - i * 0.08) / 0.5, 0, 1));
      ecAlpha(ctx, GA, q);
      ecPanel(ctx, bx, by + i * (bh * 1.5), fw * v * q, bh, bh / 2, data[i].color, null, 0);
      ecText(ctx, ecS(data[i].label, ''), bx + 10, by + i * (bh * 1.5) + bh / 2, bh * 0.55, p3Ink(data[i].color), 'left', 700);
    }

  } else if (id === 'bulletGraph') {
    const v = ecClamp(ecN(p.value, 0.64), 0, 1);
    const target = ecClamp(ecN(p.target, 0.82), 0, 1);
    const bh = fh * 0.24;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, y - bh / 2, fw, bh, 3, 'rgba(255,255,255,0.1)', null, 0);
    ecPanel(ctx, bx, y - bh / 2, fw * v * e, bh, 3, col, null, 0);
    ecLine(ctx, bx + fw * target, y - bh * 0.9, bx + fw * target, y + bh * 0.9, acc, 5);
    ecText(ctx, ecS(p.text, ''), bx, y - fh * 0.28, 20, 'rgba(255,255,255,0.6)', 'left', 600);

  } else if (id === 'candleStickMini') {
    const n = 9, cw = fw / (n * 2);
    for (let i = 0; i < n; i++) {
      const mid = by + fh * (0.2 + ecHash(i) * 0.6);
      const hi = mid - fh * (0.08 + ecHash(i + 5) * 0.14);
      const lo = mid + fh * (0.08 + ecHash(i + 9) * 0.14);
      const open = mid - fh * 0.08, close = mid + fh * (ecHash(i + 3) - 0.5) * 0.14;
      const cx = bx + cw + i * cw * 2;
      const up = close < open;
      ecAlpha(ctx, GA, e);
      ecLine(ctx, cx, hi, cx, lo, up ? '#34D399' : '#F87171', 2);
      ctx.fillStyle = up ? '#34D399' : '#F87171';
      ctx.fillRect(cx - cw * 0.45, Math.min(open, close), cw * 0.9, Math.max(2, Math.abs(close - open)));
    }

  } else if (id === 'chordFlowChart') {
    const n = 5, rad = Math.min(fw, fh) * 0.34;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const a1 = -Math.PI / 2 + (j / n) * Math.PI * 2;
        ctx.strokeStyle = colors[i % colors.length]; ctx.globalAlpha = ecClamp(GA * 0.35 * e, 0, 1);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a0) * rad, y + Math.sin(a0) * rad);
        ctx.quadraticCurveTo(x, y, x + Math.cos(a1) * rad, y + Math.sin(a1) * rad);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      ecDot(ctx, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 8, colors[i % colors.length]);
    }

  } else if (id === 'circularProgressChart') {
    const rad = Math.min(fw, fh) * 0.3;
    const parts = it(3);
    let total = parts.reduce((s, o) => s + Math.abs(ecN(o.value, 1)), 0) || 1;
    let ang = -Math.PI / 2;
    for (let i = 0; i < parts.length; i++) {
      const sweep = (Math.abs(ecN(parts[i].value, 1)) / total) * Math.PI * 2 * e;
      ctx.strokeStyle = parts[i].color; ctx.lineWidth = 24; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, rad, ang, ang + sweep); ctx.stroke();
      ang += sweep;
    }

  } else if (id === 'columnCompareChart') {
    const data = it(4), mx = maxOf(data);
    const bw = fw / (data.length * 1.5);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(ecN(data[i].value, 1)) / mx;
      const q = icEase(ecClamp((prog - i * 0.08) / 0.45, 0, 1));
      const cw = bw * 0.7;
      const hh = fh * v * q;
      ecPanel(ctx, bx + i * (bw * 1.5) + bw * 0.15, by + fh - hh, cw, hh, 4, data[i].color, null, 0);
    }
    ecLine(ctx, bx, by + fh, bx + fw, by + fh, axis, 2);

  } else if (id === 'donutSegmentChart') {
    const rad = Math.min(fw, fh) * 0.3;
    const parts = it(5);
    let total = parts.reduce((s, o) => s + Math.abs(ecN(o.value, 1)), 0) || 1;
    let ang = -Math.PI / 2;
    for (let i = 0; i < parts.length; i++) {
      const sweep = (Math.abs(ecN(parts[i].value, 1)) / total) * Math.PI * 2 * e;
      ctx.strokeStyle = parts[i].color; ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(x, y, rad, ang, ang + sweep); ctx.stroke();
      ang += sweep;
    }
    ctx.beginPath(); ctx.arc(x, y, rad - 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4,7,15,0.85)'; ctx.fill();

  } else if (id === 'dotPlotChart') {
    const data = it(5);
    for (let i = 0; i < data.length; i++) {
      const v = ecClamp(Math.abs(ecN(data[i].value, 1)) / maxOf(data), 0, 1);
      const py = by + fh * 0.1 + i * (fh * 0.18);
      ecLine(ctx, bx, py, bx + fw, py, 'rgba(255,255,255,0.12)', 1);
      ecDot(ctx, bx + fw * v * e, py, 9, data[i].color);
    }

  } else if (id === 'dumbbellRangeChart') {
    const data = it(4);
    for (let i = 0; i < data.length; i++) {
      const v0 = ecClamp(ecN(data[i].value, 0.4), 0, 1);
      const v1 = ecClamp(v0 + 0.25, 0, 1);
      const py = by + fh * 0.12 + i * (fh * 0.2);
      ecLine(ctx, bx + fw * v0, py, bx + fw * v1, py, 'rgba(255,255,255,0.4)', 4);
      ecDot(ctx, bx + fw * v0, py, 8, col);
      ecDot(ctx, bx + fw * v1, py, 8, acc);
    }

  } else if (id === 'funnelStageChart') {
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const w0 = fw * (0.9 - i * 0.18), w1 = fw * (0.9 - (i + 1) * 0.18);
      const ny = by + i * (fh / rows);
      const hh = fh / rows - 6;
      ctx.beginPath();
      ctx.moveTo(x - w0 / 2, ny); ctx.lineTo(x + w0 / 2, ny);
      ctx.lineTo(x + w1 / 2, ny + hh); ctx.lineTo(x - w1 / 2, ny + hh);
      ctx.closePath(); ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = ecClamp(GA * 0.75, 0, 1); ctx.fill();
      ctx.globalAlpha = 1;
    }

  } else if (id === 'gaugeNeedleChart') {
    const rad = Math.min(fw, fh) * 0.33;
    const start = Math.PI * 0.75, end = Math.PI * 2.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, rad, start, end); ctx.stroke();
    const pct = ecClamp(ecN(p.value, 0.62), 0, 1);
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(x, y, rad, start, start + (end - start) * pct * e); ctx.stroke();
    const na = start + (end - start) * pct * e;
    ecLine(ctx, x, y, x + Math.cos(na) * rad * 0.8, y + Math.sin(na) * rad * 0.8, acc, 5);
    ecDot(ctx, x, y, 10, white);

  } else if (id === 'heatmapCalendar') {
    const cols = 12, rows = 5, cw = fw / cols, ch = fh / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = ecHash(r * 17 + c * 5 + 1);
        ctx.fillStyle = v > 0.72 ? col : (v > 0.42 ? acc : 'rgba(255,255,255,0.08)');
        ctx.globalAlpha = ecClamp(GA * (0.4 + v * 0.6), 0, 1);
        ecRound(ctx, bx + c * cw + 1, by + r * ch + 1, cw - 2, ch - 2, 3); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

  } else if (id === 'histogramBins') {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const v = 0.2 + Math.abs(Math.sin(i * 0.8 + 0.4)) * 0.75;
      const bw = fw / n * 0.76;
      const hh = fh * v * e;
      ecPanel(ctx, bx + i * (fw / n), by + fh - hh, bw, hh, 2, i % 2 ? acc : col, null, 0);
    }

  } else if (id === 'lineForecastChart') {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const q = i / 20;
      const v = 0.24 + q * 0.5 + Math.sin(q * 6) * 0.08;
      const px = bx + q * fw, py = by + fh - v * fh * e;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([8, 8]); ctx.strokeStyle = acc;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const q = i / 10;
      const v = 0.74 + q * 0.16;
      const px = bx + fw * 0.5 + q * fw * 0.5, py = by + fh - v * fh * e;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);

  } else if (id === 'pieSplitChart') {
    const rad = Math.min(fw, fh) * 0.3;
    const parts = it(4);
    let total = parts.reduce((s, o) => s + Math.abs(ecN(o.value, 1)), 0) || 1;
    let ang = -Math.PI / 2;
    for (let i = 0; i < parts.length; i++) {
      const sweep = (Math.abs(ecN(parts[i].value, 1)) / total) * Math.PI * 2 * e;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.arc(x, y, rad, ang, ang + sweep); ctx.closePath();
      ctx.fillStyle = parts[i].color; ctx.globalAlpha = ecClamp(GA * 0.9, 0, 1); ctx.fill();
      ctx.globalAlpha = 1;
      ang += sweep;
    }

  } else if (id === 'radarSpiderChart') {
    const n = 6, rad = Math.min(fw, fh) * 0.3;
    for (let ring = 1; ring <= 3; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const px = x + Math.cos(ang) * rad * (ring / 3), py = y + Math.sin(ang) * rad * (ring / 3);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const v = 0.35 + ecHash(i % n) * 0.6;
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const px = x + Math.cos(ang) * rad * v * e, py = y + Math.sin(ang) * rad * v * e;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = 'rgba(56,189,248,0.25)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();

  } else if (id === 'sankeyRibbonChart') {
    const n = 4, hh = fh / n;
    for (let i = 0; i < n; i++) {
      const v = 0.35 + ecHash(i + 2) * 0.5;
      ctx.beginPath();
      ctx.moveTo(bx, by + i * hh + hh * 0.2);
      ctx.bezierCurveTo(x, by + i * hh, x, by + (i + 1) * hh, bx + fw, by + i * hh + hh * 0.2);
      ctx.lineTo(bx + fw, by + i * hh + hh * (0.2 + v));
      ctx.bezierCurveTo(x, by + (i + 1) * hh + hh * v, x, by + i * hh + hh * v, bx, by + i * hh + hh * (0.2 + v));
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length]; ctx.globalAlpha = ecClamp(GA * 0.55, 0, 1); ctx.fill();
      ctx.globalAlpha = 1;
    }

  } else if (id === 'scatterTrendChart') {
    for (let i = 0; i < 26; i++) {
      const px = bx + ecHash(i) * fw;
      const py = by + fh - (0.2 + ecHash(i + 7) * 0.7) * fh + (ecHash(i + 3) - 0.5) * fh * 0.12;
      ecDot(ctx, px, py, 5 + ecHash(i + 11) * 4, i % 3 === 0 ? acc : col);
    }

  } else if (id === 'sparklineMini') {
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const q = i / 24;
      const v = 0.3 + 0.4 * Math.sin(q * 8 + 1.2) + 0.15 * Math.sin(q * 21);
      const px = bx + q * fw, py = by + fh * (0.5 - v * 0.4);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

  } else if (id === 'stackedAreaChart') {
    const data = it(3), mx = maxOf(data);
    const vals = data.map(o => Math.abs(ecN(o.value, 1)) / mx);
    for (let s = 0; s < vals.length; s++) {
      ctx.beginPath();
      ctx.moveTo(bx, by + fh);
      for (let i = 0; i <= 20; i++) {
        const q = i / 20;
        let sum = 0;
        for (let k = 0; k <= s; k++) sum += vals[k] * (0.55 + 0.45 * Math.sin(q * 5 + k));
        ctx.lineTo(bx + q * fw, by + fh - sum * fh * 0.35 * e);
      }
      ctx.lineTo(bx + fw, by + fh); ctx.closePath();
      ctx.fillStyle = data[s].color; ctx.globalAlpha = ecClamp(GA * 0.3, 0, 1); ctx.fill();
      ctx.globalAlpha = 1;
    }

  } else if (id === 'treemapTiles') {
    const rects = [[0, 0, 0.5, 0.55], [0.5, 0, 0.5, 0.3], [0.5, 0.3, 0.25, 0.25], [0.75, 0.3, 0.25, 0.25], [0, 0.55, 0.3, 0.45], [0.3, 0.55, 0.7, 0.2], [0.3, 0.75, 0.4, 0.25], [0.7, 0.75, 0.3, 0.25]];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const q = icEase(ecClamp((prog - i * 0.05) / 0.5, 0, 1));
      ecPanel(ctx, bx + r[0] * fw, by + r[1] * fh, r[2] * fw * q, r[3] * fh * q, 3,
        colors[i % colors.length], null, 0);
    }

  } else if (id === 'violinPlot') {
    for (let i = 0; i < 3; i++) {
      const cx = bx + fw * (0.2 + i * 0.3);
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const q = k / 20;
        const w = Math.sin(q * Math.PI) * fw * 0.07 * (0.7 + ecHash(i + 3) * 0.6);
        const py = by + q * fh;
        if (k === 0) ctx.moveTo(cx - w, py); else ctx.lineTo(cx - w, py);
      }
      for (let k = 20; k >= 0; k--) {
        const q = k / 20;
        const w = Math.sin(q * Math.PI) * fw * 0.07 * (0.7 + ecHash(i + 3) * 0.6);
        ctx.lineTo(cx + w, by + q * fh);
      }
      ctx.closePath(); ctx.fillStyle = colors[i]; ctx.globalAlpha = ecClamp(GA * 0.35, 0, 1); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = colors[i]; ctx.lineWidth = 2; ctx.stroke();
    }

  } else if (id === 'waterfallSteps') {
    const n = 7, bw = fw / n * 0.66, base = by + fh;
    let level = base;
    for (let i = 0; i < n; i++) {
      const up = ecHash(i + 2) > 0.4;
      const hh = fh * (0.16 + ecHash(i + 5) * 0.2);
      const px = bx + i * (fw / n) + (fw / n - bw) / 2;
      const ny = up ? level - hh : level;
      ecPanel(ctx, px, ny, bw, hh, 2, up ? '#34D399' : '#F87171', null, 0);
      if (i < n - 1) ecLine(ctx, px + bw, up ? ny : level, px + fw / n, up ? ny : level, 'rgba(255,255,255,0.35)', 1);
      level = up ? level - hh : level + hh * 0.6;
    }

  } else if (id === 'wafflePercent') {
    const cols = 10, rows = 10, v = ecClamp(ecN(p.value, 0.64), 0, 1);
    const cell = Math.min(fw / cols, fh / rows) * 0.86;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        ctx.fillStyle = idx < Math.round(v * cols * rows) ? col : 'rgba(255,255,255,0.12)';
        ctx.fillRect(bx + c * (fw / cols) + 2, by + r * (fh / rows) + 2, cell, cell);
      }
    }
  }
}
