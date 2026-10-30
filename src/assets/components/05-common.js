/* ===== Third pack: shared helpers =========================================
   The third component pack adds 300 ids. Every family renderer lives in its
   own module and paints from the same helpers as packs one and two, so the
   theme contract (global T, params colour overrides) stays identical. */

function p3T() {
  return (typeof T !== 'undefined' && T) ? T : {};
}
function p3TextOf(p) {
  return ecS(p.text, ecS(p.title, ''));
}
function p3SubOf(p) {
  return ecS(p.subtitle, ecS(p.label, ''));
}
function p3P(p, W, H, fx, fy) {
  return ecXY(p, W, H, fx, fy);
}
function p3Base(p) {
  return ec2Base(p);
}
function p3Ink(hex) {
  return ec2InkOn(hex);
}
function p3Items(p, n, colors) {
  return ecItems(p, n, colors);
}
function p3Loop(q) {
  return ((q % 1) + 1) % 1;
}
function p3Wave(t, speed, amp) {
  return Math.sin(t * speed) * amp;
}
function p3LineCount(ctx, lines, size, lh) {
  return Math.max(1, lines.length) * (lh || size * 1.3);
}
function ecDot(ctx, x, y, r, color) {
  const rr = Math.max(0.1, ecN(r, 2));
  ctx.save();
  ctx.fillStyle = color || '#38BDF8';
  ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function p3RowLabel(r) {
  if (r && typeof r === 'object') {
    return ecS(r.text, ecS(r.label, ecS(r.name, ecS(r.title, ''))));
  }
  return ecS(r, '');
}
function p3RowVal(r) {
  if (r && typeof r === 'object') {
    if (r.value != null) return r.value;
    if (r.v != null) return r.v;
    if (r.amount != null) return r.amount;
    if (r.n != null) return r.n;
  }
  return undefined;
}
function p3Rows(p, n) {
  let src = (p && (p.rows || p.items || p.list)) || null;
  if (typeof src === 'string') src = src.split(/\n|\s*\|\s*/);
  if (!Array.isArray(src) || !src.length) {
    src = p3TextOf(p).split(/\n|\s*\|\s*/).filter(Boolean);
  }
  return src.slice(0, Math.max(1, n)).map(x =>
    (x && typeof x === 'object') ? x : { text: String(x == null ? '' : x) });
}
function p3NumFmt(v, decimals, prefix, suffix) {
  const n = ecN(v, 0);
  const d = Math.max(0, Math.min(6, Math.round(ecN(decimals, 0))));
  const s = n.toLocaleString('en-US', {
    minimumFractionDigits: d, maximumFractionDigits: d
  });
  return ecS(prefix, '') + s + ecS(suffix, '');
}
