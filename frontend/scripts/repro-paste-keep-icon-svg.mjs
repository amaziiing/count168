/**
 * 1.TEXT + 2.FORMAT: keep report action icon/svg after sanitize (not form inputs).
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window,
  document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
});

const { sanitizePastedCellHtml, stripInteractiveUiFromHtml } = await import(
  pathToFileURL(
    path.join(__dirname, "../src/pages/datacapture/paste/core/dataCaptureClipboard.js"),
  ).href,
);

const iconCell =
  '<button type="button" class="mat-icon-button" onclick="evil()">' +
  '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>';

const mixed =
  'AW07 <button type="button"><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg></button>';

const withInput = 'x<input type="text" value="secret"/>y';

const a = sanitizePastedCellHtml(iconCell);
const b = sanitizePastedCellHtml(mixed);
const c = sanitizePastedCellHtml(withInput);
const d = stripInteractiveUiFromHtml(iconCell);

const checks = {
  keepsSvg: /<svg\b/i.test(a) && /<svg\b/i.test(b),
  keepsButton: /<button\b/i.test(a),
  stripsOnclick: !/onclick/i.test(a),
  stripsInput: !/<input\b/i.test(c) && /x/.test(c) && /y/.test(c),
  stripHelperKeepsSvg: /<svg\b/i.test(d),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, a: a.slice(0, 120) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS paste keeps icon/svg for TEXT+FORMAT sanitize");
