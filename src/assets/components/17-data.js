/* Third pack: data displays (25). */
function p3Data(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const sz = ecN(p.size, 24);
  const e = icEase(prog);
  const white = '#F4F8FF';
  const rows = p3Rows(p, 6);
  const n = rows.length;
  const rl = i => p3RowLabel(rows[i % n]);
  const rv = i => ecN(p3RowVal(rows[i % n]), 0);
  const fw = Math.min(W * 0.78, 720);
  const fh = Math.min(H * 0.5, 560);
  const bx = x - fw / 2, by = y - fh / 2;
  const label = p3TextOf(p);

  if (id === 'dataTable') {
    const cols = 3, cw = fw / cols;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw, 40, 6, 'rgba(255,255,255,0.12)', null, 0);
    for (let c = 0; c < cols; c++) ecText(ctx, ['Name', 'Value', 'Delta'][c], bx + c * cw + 16, by + 20, sz * 0.62, white, 'left', 700);
    for (let r = 0; r < n; r++) {
      const ry = by + 40 + r * 38;
      if (r % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(bx, ry, fw, 38); }
      ecText(ctx, rl(r), bx + 16, ry + 19, sz * 0.58, white, 'left', 500);
      ecText(ctx, p3NumFmt(rv(r), 0), bx + cw + 16, ry + 19, sz * 0.58, 'rgba(255,255,255,0.75)', 'left', 500);
      ecText(ctx, (r % 2 ? '+' : '-') + (3 + r * 2) + '%', bx + cw * 2 + 16, ry + 19, sz * 0.58, r % 2 ? '#34D399' : '#F87171', 'left', 600);
    }

  } else if (id === 'dataTimeline') {
    ecAlpha(ctx, GA, e);
    ecLine(ctx, bx + 30, y, bx + fw - 30, y, 'rgba(255,255,255,0.28)', 2);
    for (let i = 0; i < Math.min(n, 6); i++) {
      const px = bx + 30 + (i / Math.max(1, n - 1)) * (fw - 60);
      ecDot(ctx, px, y, sz * 0.28, i % 2 ? acc : col);
      ecText(ctx, rl(i), px, y - sz * 1.2, sz * 0.44, white, 'center', 600);
      ecText(ctx, 'T+' + i, px, y + sz * 1.1, sz * 0.34, 'rgba(255,255,255,0.45)', 'center', 500);
    }

  } else if (id === 'dataKpiGrid') {
    const cols = 3, cw = fw / cols, ch = fh / 2;
    for (let i = 0; i < 6; i++) {
      const gx = bx + (i % cols) * cw, gy = by + Math.floor(i / cols) * ch;
      ecAlpha(ctx, GA, e);
      ecPanel(ctx, gx + 4, gy + 4, cw - 8, ch - 8, 10, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.12)', 1);
      ecText(ctx, rl(i), gx + 18, gy + 24, sz * 0.44, 'rgba(255,255,255,0.6)', 'left', 600);
      ecText(ctx, p3NumFmt(rv(i), 0), gx + 18, gy + ch * 0.62, sz * 0.9, white, 'left', 900);
    }

  } else if (id === 'dataScoreboard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw, fh, 18, 'rgba(5,10,20,0.85)', border(), 2);
    ecText(ctx, rl(0), bx + fw * 0.25, y - sz * 0.2, sz * 0.7, 'rgba(255,255,255,0.65)', 'center', 700);
    ecText(ctx, rl(1), bx + fw * 0.75, y - sz * 0.2, sz * 0.7, 'rgba(255,255,255,0.65)', 'center', 700);
    ecText(ctx, p3NumFmt(rv(0), 0), bx + fw * 0.25, y + sz * 0.5, sz * 2.0, white, 'center', 900);
    ecText(ctx, p3NumFmt(rv(1), 0), bx + fw * 0.75, y + sz * 0.5, sz * 2.0, white, 'center', 900);
    ecText(ctx, ':', x, y + sz * 0.3, sz * 1.2, acc, 'center', 900);

  } else if (id === 'dataLeaderboard') {
    for (let i = 0; i < n; i++) {
      const ry = by + i * (fh / Math.max(1, n));
      ecAlpha(ctx, GA, e);
      if (i === 0) ecPanel(ctx, bx, ry, fw, fh / Math.max(1, n) - 6, 8, 'rgba(255,255,255,0.1)', acc, 1.5);
      ecText(ctx, String(i + 1), bx + 20, ry + 20, sz * 0.6, i === 0 ? acc : 'rgba(255,255,255,0.4)', 'left', 900);
      ecText(ctx, rl(i), bx + 70, ry + 20, sz * 0.55, white, 'left', 600);
      ecText(ctx, p3NumFmt(rv(i), 0), bx + fw - 20, ry + 20, sz * 0.55, 'rgba(255,255,255,0.75)', 'right', 700);
    }

  } else if (id === 'dataSchedule') {
    const cols = 5, cw = fw / cols;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw, fh * 0.86, 12, 'rgba(255,255,255,0.05)', border(), 1);
    for (let c = 0; c < cols; c++) ecText(ctx, ['M', 'T', 'W', 'T', 'F'][c], bx + c * cw + cw / 2, by + 18, sz * 0.42, 'rgba(255,255,255,0.5)', 'center', 600);
    for (let i = 0; i < 12; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const q = ecHash(i + 2);
      if (q < 0.45) continue;
      ecPanel(ctx, bx + c * cw + 4, by + 34 + r * ((fh * 0.86 - 34) / 3), cw - 8, (fh * 0.86 - 34) / 3 - 6, 4,
        q > 0.8 ? acc : col, null, 0);
    }

  } else if (id === 'dataMatrix') {
    const cols = Math.ceil(Math.sqrt(Math.max(1, n * 2)));
    const cell = Math.min(fw, fh) / cols;
    for (let i = 0; i < cols * cols; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const v = ecHash(i + 3);
      ctx.fillStyle = v > 0.68 ? col : (v > 0.36 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)');
      ctx.globalAlpha = ecClamp(GA * e, 0, 1);
      ecRound(ctx, bx + c * cell + 2, by + r * cell + 2, cell - 4, cell - 4, 5); ctx.fill();
    }
    ctx.globalAlpha = 1;

  } else if (id === 'dataLegend') {
    const items = p3Items(p, 5, [col, acc, '#8B5CF6', '#34D399', '#F472B6']);
    for (let i = 0; i < items.length; i++) {
      const ry = y - (items.length - 1) * 20 + i * 40;
      ecAlpha(ctx, GA, e);
      ecDot(ctx, x - fw * 0.3, ry, 8, items[i].color);
      ecText(ctx, ecS(items[i].label, 'Item ' + (i + 1)), x - fw * 0.26, ry, sz * 0.55, white, 'left', 600);
      ecText(ctx, p3NumFmt(ecN(items[i].value, 0), 0), x + fw * 0.32, ry, sz * 0.55, 'rgba(255,255,255,0.65)', 'right', 600);
    }

  } else if (id === 'dataSparkGrid') {
    const cols = 3, cw = fw / cols, ch = fh / 2;
    for (let i = 0; i < 6; i++) {
      const gx = bx + (i % cols) * cw, gy = by + Math.floor(i / cols) * ch;
      ecText(ctx, rl(i), gx + 12, gy + 16, sz * 0.42, 'rgba(255,255,255,0.6)', 'left', 600);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) {
        const px = gx + 12 + (k / 10) * (cw - 24);
        const py = gy + ch * 0.65 - ecHash(i * 11 + k) * ch * 0.35;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (id === 'dataRatioBar') {
    const parts = p3Items(p, 4, [col, acc, '#8B5CF6', '#34D399']);
    let total = parts.reduce((s, o) => s + Math.abs(ecN(o.value, 1)), 0) || 1;
    let cx = bx;
    ecAlpha(ctx, GA, e);
    for (let i = 0; i < parts.length; i++) {
      const w0 = (Math.abs(ecN(parts[i].value, 1)) / total) * fw * e;
      ecPanel(ctx, cx, y - sz * 0.5, w0, sz, 3, parts[i].color, null, 0);
      cx += w0;
    }

  } else if (id === 'dataHeatRow') {
    const cols = 12, cw = fw / cols;
    for (let i = 0; i < cols; i++) {
      const v = ecHash(i + 2);
      ctx.fillStyle = v > 0.7 ? col : (v > 0.4 ? acc : 'rgba(255,255,255,0.08)');
      ctx.globalAlpha = ecClamp(GA * e, 0, 1);
      ecRound(ctx, bx + i * cw + 2, y - 20, cw - 4, 40, 4); ctx.fill();
    }
    ctx.globalAlpha = 1;

  } else if (id === 'dataCalendarHeat') {
    const cols = 20, rows = 7, cw = fw / cols, ch = fh * 0.7 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = ecHash(r * 31 + c * 7 + 3);
        ctx.fillStyle = v > 0.72 ? col : (v > 0.42 ? acc : 'rgba(255,255,255,0.06)');
        ctx.globalAlpha = ecClamp(GA * e, 0, 1);
        ecRound(ctx, bx + c * cw + 1, by + r * ch + 1, cw - 2, ch - 2, 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

  } else if (id === 'dataProgressList') {
    for (let i = 0; i < n; i++) {
      const ry = by + i * (fh / Math.max(1, n));
      const q = icEase(ecClamp((prog - i * 0.06) / 0.5, 0, 1));
      ecAlpha(ctx, GA, q);
      ecText(ctx, rl(i), bx, ry, sz * 0.55, white, 'left', 500);
      ecPanel(ctx, bx + fw * 0.4, ry - 4, fw * 0.5, sz * 0.32, sz * 0.16, 'rgba(255,255,255,0.12)', null, 0);
      ecPanel(ctx, bx + fw * 0.4, ry - 4, fw * 0.5 * ecClamp(ecHash(i + 3), 0.2, 1) * q, sz * 0.32, sz * 0.16, i % 2 ? acc : col, null, 0);
    }

  } else if (id === 'dataComparisonTable') {
    const cols = 3, cw = fw / cols;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw, 34, 4, 'rgba(255,255,255,0.1)', null, 0);
    ['Feature', 'A', 'B'].forEach((t, i) => ecText(ctx, t, bx + i * cw + 12, by + 17, sz * 0.44, white, 'left', 700));
    for (let r = 0; r < n; r++) {
      const ry = by + 34 + r * 34;
      ecText(ctx, rl(r), bx + 12, ry + 17, sz * 0.44, 'rgba(255,255,255,0.7)', 'left', 500);
      ecDot(ctx, bx + cw + 20, ry + 17, sz * 0.16, r % 3 ? '#34D399' : '#F87171');
      ecDot(ctx, bx + cw * 2 + 20, ry + 17, sz * 0.16, r % 2 ? '#34D399' : '#F87171');
    }

  } else if (id === 'dataMetricCards') {
    const cells = p3Items(p, 3, [col, acc, '#8B5CF6']);
    const cw = fw / 3;
    for (let i = 0; i < 3; i++) {
      const gx = bx + i * cw;
      ecAlpha(ctx, GA, e);
      ecPanel(ctx, gx + 4, by, cw - 8, fh * 0.6, 10, 'rgba(255,255,255,0.06)', border(), 1);
      ecText(ctx, ecS(cells[i].label, 'Metric'), gx + 16, by + 24, sz * 0.4, 'rgba(255,255,255,0.55)', 'left', 600);
      ecText(ctx, p3NumFmt(ecN(cells[i].value, 0), 0), gx + 16, by + fh * 0.3, sz * 0.9, white, 'left', 900);
      ecPanel(ctx, gx + 16, by + fh * 0.45, (cw - 32) * ecClamp(ecHash(i + 2), 0.2, 1), 4, 2, cells[i].color, null, 0);
    }

  } else if (id === 'dataGaugeCluster') {
    for (let i = 0; i < 3; i++) {
      const gx = x + (i - 1) * Math.min(fw / 3, 180);
      const r = Math.min(fw / 7, 60);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(gx, y, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      ctx.strokeStyle = i % 2 ? acc : col;
      ctx.beginPath(); ctx.arc(gx, y, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * ecClamp(ecHash(i + 3), 0.2, 1) * e); ctx.stroke();
      ecText(ctx, String(i + 1), gx, y, sz * 0.5, white, 'center', 800);
    }

  } else if (id === 'dataTrafficLights') {
    for (let i = 0; i < 3; i++) {
      const gx = x + (i - 1) * sz * 2.4;
      ecPanel(ctx, gx - sz * 0.6, y - sz * 2.4, sz * 1.2, sz * 4.8, sz * 0.5, 'rgba(255,255,255,0.08)', border(), 1);
      ['#F87171', '#FBBF24', '#34D399'].forEach((c, k) => {
        ecDot(ctx, gx, y - sz * 1.5 + k * sz * 1.5, sz * 0.28, k === i ? c : 'rgba(255,255,255,0.14)');
      });
      ecText(ctx, rl(i), gx, y + sz * 2.8, sz * 0.36, white, 'center', 600);
    }

  } else if (id === 'dataStepTimeline') {
    for (let i = 0; i < n; i++) {
      const px = bx + (i / Math.max(1, n - 1)) * fw;
      const q = icEase(ecClamp((prog - i * 0.08) / 0.4, 0, 1));
      ecAlpha(ctx, GA, q);
      ecDot(ctx, px, y, sz * 0.28, i <= prog * n ? acc : col);
      if (i < n - 1) ecLine(ctx, px, y, bx + ((i + 1) / Math.max(1, n - 1)) * fw, y, 'rgba(255,255,255,0.25)', 2);
      ecText(ctx, rl(i), px, y - sz * 1.3, sz * 0.4, white, 'center', 600);
    }

  } else if (id === 'dataLiveTicker') {
    const txt = rows.map(rl).join('   •   ');
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - sz, W, sz * 2); ctx.clip();
    ecAlpha(ctx, GA, e);
    ctx.font = '700 ' + Math.round(sz * 0.9) + 'px ' + EC_FONT;
    const tw = ctx.measureText(txt).width + 80;
    const off = (el * 140) % tw;
    ctx.fillStyle = white; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let tx = -off; tx < W; tx += tw) ctx.fillText(txt, tx, y);
    ctx.restore();

  } else if (id === 'dataPollBars') {
    const mx = Math.max(1, ...rows.map((_, i) => rv(i)));
    for (let i = 0; i < n; i++) {
      const ry = by + i * (fh / Math.max(1, n));
      const q = icEase(ecClamp((prog - i * 0.08) / 0.5, 0, 1));
      ecAlpha(ctx, GA, q);
      ecText(ctx, rl(i), bx, ry, sz * 0.5, white, 'left', 500);
      ecPanel(ctx, bx + fw * 0.4, ry - 4, fw * 0.52, sz * 0.34, 3, 'rgba(255,255,255,0.12)', null, 0);
      ecPanel(ctx, bx + fw * 0.4, ry - 4, fw * 0.52 * (rv(i) / mx) * q, sz * 0.34, 3, i % 2 ? acc : col, null, 0);
      ecText(ctx, p3NumFmt(rv(i), 0), bx + fw * 0.94, ry, sz * 0.38, 'rgba(255,255,255,0.6)', 'right', 600);
    }

  } else if (id === 'dataRankingList') {
    for (let i = 0; i < n; i++) {
      const ry = by + i * (fh / Math.max(1, n));
      ecAlpha(ctx, GA, e);
      ecText(ctx, String(i + 1).padStart(2, '0'), bx + 10, ry, sz * 0.7, i === 0 ? acc : 'rgba(255,255,255,0.35)', 'left', 900);
      ecText(ctx, rl(i), bx + 70, ry, sz * 0.52, white, 'left', 600);
      ecText(ctx, p3NumFmt(rv(i), 0), bx + fw - 10, ry, sz * 0.52, 'rgba(255,255,255,0.7)', 'right', 600);
    }

  } else if (id === 'dataDonutGrid') {
    const cols = 2, cw = fw / cols, ch = fh / 2;
    for (let i = 0; i < 4; i++) {
      const gx = bx + (i % cols) * cw + cw / 2;
      const gy = by + Math.floor(i / cols) * ch + ch / 2;
      const r = Math.min(cw, ch) * 0.2;
      const v = ecClamp(ecHash(i + 2), 0.2, 0.95);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = i % 2 ? acc : col;
      ctx.beginPath(); ctx.arc(gx, gy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v * e); ctx.stroke();
      ecText(ctx, Math.round(v * 100) + '%', gx, gy, sz * 0.36, white, 'center', 700);
    }

  } else if (id === 'dataWaterfallList') {
    let level = y + fh * 0.3;
    for (let i = 0; i < n; i++) {
      const v = rv(i) || (1 + i);
      const hh = Math.min(fh * 0.18, Math.abs(v) * 6);
      const up = v >= 0;
      ecPanel(ctx, bx + i * (fw / Math.max(1, n)) + 4, up ? level - hh : level, fw / Math.max(1, n) - 8, hh, 2, up ? '#34D399' : '#F87171', null, 0);
      level += up ? -hh : hh;
    }

  } else if (id === 'dataNetworkMap') {
    const pts = n > 0 ? rows.map((_, i) => [ecHash(i + 2), ecHash(i + 5)]) : [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if ((i + j) % 3 !== 0) continue;
        ecLine(ctx, bx + pts[i][0] * fw, by + pts[i][1] * fh, bx + pts[j][0] * fw, by + pts[j][1] * fh, 'rgba(255,255,255,0.22)', 1.5);
      }
    }
    for (let i = 0; i < pts.length; i++) ecDot(ctx, bx + pts[i][0] * fw, by + pts[i][1] * fh, sz * 0.22, i % 2 ? acc : col);

  } else if (id === 'dataSummaryPanel') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw, fh, 16, 'rgba(10,16,28,0.8)', border(), 1.5);
    ecText(ctx, label || 'Summary', bx + 24, by + 36, sz * 0.8, white, 'left', 800);
    for (let i = 0; i < Math.min(n, 5); i++) {
      const ry = by + 72 + i * 34;
      ecText(ctx, rl(i), bx + 24, ry, sz * 0.5, 'rgba(255,255,255,0.65)', 'left', 500);
      ecText(ctx, p3NumFmt(rv(i), 0), bx + fw - 24, ry, sz * 0.5, white, 'right', 700);
    }
  }
}

function border() {
  return 'rgba(255,255,255,0.15)';
}
