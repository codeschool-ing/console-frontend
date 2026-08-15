/* ==========================================================================
   The two lines of DOM helper the console actually uses.

   WHY THIS IS NOT A COPY OF portal-frontend's app/text.js. That file is 200+
   lines — prose rendering, the copy button, a seeded shuffle — and the console
   needs one function out of it. A copy would put 200 lines under the shared-file
   check to keep 4 honest, and every future divergence in the portal's prose
   helpers would fail a check about a console that never called them.

   `assets/base.css` and `app/routes.js` are different: they are used whole, they
   are byte-identical, and CI diffs them. This is the line between "share it and
   check it" and "own four lines".
   ========================================================================== */

/* Escapes for interpolation into HTML. The single quote is in the list because
   an attribute may be quoted with one, and the ampersand is FIRST because
   escaping it after the others would double-escape what they produced. */
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
