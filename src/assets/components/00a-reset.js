/* Nothing on screen comes from the browser. Every engine ships a stylesheet
   of its own — margins on headings and paragraphs, bold on <b>, bullets on
   lists, a grey bevel on buttons, its own font on form controls — and each
   engine's differs a little. This sheet removes all of it, for the pages
   (editor and player) and for every HTML scene, so what an element looks
   like is only ever what our own CSS says.

   Every selector has zero specificity (`*` or `:where()`), so any rule a
   page or a scene writes wins without having to fight this one. */
const SW_RESET_CSS = [
  '*, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid currentColor; }',
  ':where(html) { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; tab-size: 4; }',
  /* type: one size, one weight, one style, until a rule says otherwise */
  ':where(h1, h2, h3, h4, h5, h6, b, strong, i, em, small, big, code, kbd, samp, pre, address, cite, dfn, var, th, caption, legend) { font: inherit; }',
  ':where(sub, sup) { font-size: inherit; vertical-align: baseline; }',
  ':where(a) { color: inherit; text-decoration: none; }',
  ':where(mark) { background: none; color: inherit; }',
  ':where(abbr[title]) { text-decoration: none; }',
  ':where(q, blockquote)::before, :where(q, blockquote)::after { content: none; }',
  ':where(ul, ol, menu, summary) { list-style: none; }',
  ':where(th, td, caption) { text-align: inherit; vertical-align: top; }',
  ':where(table) { border-collapse: collapse; border-spacing: 0; }',
  /* media: a block that never outgrows its box */
  ':where(img, svg, video, canvas, picture, iframe, object, embed) { display: block; max-width: 100%; }',
  /* controls: text and a box, no look of their own */
  ':where(button, input, select, textarea, optgroup) { font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; background: none; border-radius: 0; outline: none; appearance: none; -webkit-appearance: none; }',
  ':where(button) { cursor: pointer; text-align: inherit; }',
  ':where(textarea) { resize: none; }',
  ':where(dialog) { background: none; color: inherit; max-width: none; max-height: none; }',
  ':where(hr) { height: 0; }',
  ':where([hidden]) { display: none; }'
].join('\n');

/* The pages take it as their first stylesheet, ahead of their own rules. */
(function swResetPage() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('sw-reset')) return;
  const sheet = document.createElement('style');
  sheet.id = 'sw-reset';
  sheet.textContent = SW_RESET_CSS;
  document.head.prepend(sheet);
})();
