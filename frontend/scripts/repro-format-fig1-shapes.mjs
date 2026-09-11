/**
 * Reproduce Fig1 shapes: N×1 TR-per-field, BR-in-one-TD, and mat-native.
 * Expect: 3×9 horizontal like Fig2 — failred if still stacked in col1.
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.DOMParser = window.DOMParser;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { normalizeClipboardHtmlToTable, clipboardHtmlLooksLikeAngularMaterial } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { formatBodyMatrixLooksCollapsed } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { formatHtmlLooksLikeVerticalNx1 } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href,
);

const amounts = [
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
];
const rows = [
  ["SDSPDA95", ...amounts],
  ["Subtotal", ...amounts],
  ["Total Amount", ...amounts],
];

function shape(label, html) {
  const looksMat = clipboardHtmlLooksLikeAngularMaterial(html);
  const n = normalizeClipboardHtmlToTable(html) || html;
  const nx1 = formatHtmlLooksLikeVerticalNx1(n);
  const s = sanitizePastedHTML(n) || n;
  const st = parseFormatHtmlTableStructure(s);
  if (!st) {
    console.log(JSON.stringify({ label, looksMat, error: "NO STRUCTURE", nx1 }));
    return { ok: false };
  }
  const m = buildFormatBodyMatrix(st.dataRows, st.maxCols);
  const collapsed = formatBodyMatrixLooksCollapsed(m, st.dataRows);
  const r0 = (m[0] || []).map((c) => c.value);
  const ok =
    m.length === 3 &&
    r0.length >= 9 &&
    r0[0] === "SDSPDA95" &&
    r0[1] === "7,182" &&
    !collapsed;
  console.log(
    JSON.stringify(
      {
        label,
        ok,
        looksMat,
        afterNormNx1: nx1,
        rows: m.length,
        cols: st.maxCols,
        collapsed,
        r0: r0.slice(0, 4),
      },
      null,
      2,
    ),
  );
  return { ok, m, collapsed, nx1 };
}

const flat = rows.flat();
const nx1Html = `<!--StartFragment--><table><tbody>${flat
  .map((v) => `<tr><td>${v}</td></tr>`)
  .join("")}</tbody></table><!--EndFragment-->`;

const brHtml = `<!--StartFragment--><table><tbody>${rows
  .map((r) => `<tr><td>${r.join("<br>")}</td></tr>`)
  .join("")}</tbody></table><!--EndFragment-->`;

const matHtml = `<!--StartFragment--><style>.positive{color:#82c751}</style>${rows
  .map(
    (fields) =>
      `<mat-row role="row">${fields
        .map(
          (v, i) =>
            `<mat-cell class="mat-cell${i === 8 ? " positive" : ""}" role="gridcell">${
              i === 0 && fields[0] === "SDSPDA95" ? `<a href="#">${v}</a>` : v
            }</mat-cell>`,
        )
        .join("")}</mat-row>`,
  )
  .join("")}<!--EndFragment-->`;

// Chrome: table wraps one TD containing all mat-cells for a row
const wrapHtml = `<!--StartFragment--><table><tbody>${rows
  .map(
    (fields) =>
      `<tr><td>${fields
        .map(
          (v, i) =>
            `<div class="mat-cell" role="gridcell">${
              i === 0 && fields[0] === "SDSPDA95" ? `<a href="#">${v}</a>` : v
            }</div>`,
        )
        .join("")}</td></tr>`,
  )
  .join("")}</tbody></table><!--EndFragment-->`;

const results = [
  shape("nx1-table", nx1Html),
  shape("br-cells", brHtml),
  shape("mat-native", matHtml),
  shape("wrap-mat-in-td", wrapHtml),
];

const plain = flat.join("\n");
const pm = parsePlainTextMatrix(plain);
console.log(
  JSON.stringify(
    {
      plainReshape: { rows: pm?.length, cols: pm?.[0]?.length, r0: pm?.[0]?.slice(0, 4) },
    },
    null,
    2,
  ),
);

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`FAIL ${failed.length} fixture(s) still look like Fig1`);
  process.exit(1);
}
console.log("PASS all fixtures → Fig2 shape (3×9)");
