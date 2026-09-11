/**
 * Probe which clipboard shapes still produce Fig1 (3×1 stacked html in col1).
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
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);

const vals = [
  "SDSPDA85",
  "7,182",
  "$0.00",
  "$12,390.96",
  "$12,390.96",
  "$10,036.00",
  "$12,390.96",
  "$0.00",
  "$1,584.86",
];
const vals2 = ["SUBTOTAL", ...vals.slice(1)];
const vals3 = ["TOTAL AMOUNT", ...vals.slice(1)];

function run(name, html) {
  const normalized = normalizeClipboardHtmlToTable(html) || html;
  const sanitized = sanitizePastedHTML(normalized) || normalized;
  const structure = parseFormatHtmlTableStructure(sanitized);
  if (!structure) {
    console.log(JSON.stringify({ name, fail: "no structure" }));
    return;
  }
  const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
  const cols = matrix[0]?.length || 0;
  const html0 = String(matrix[0]?.[0]?.html || "");
  const value0 = String(matrix[0]?.[0]?.value || "");
  const fig1 =
    cols <= 1 &&
    (html0.includes("$0.00") || value0.includes("\n") || /7,182/.test(html0));
  console.log(
    JSON.stringify({
      name,
      maxCols: structure.maxCols,
      rows: matrix.length,
      cols,
      fig1,
      agent: matrix[0]?.[0]?.value,
      htmlPreview: html0.slice(0, 100),
    }),
  );
}

run(
  "nested-table-vertical",
  `<table><tbody>${[vals, vals2, vals3]
    .map(
      (row) =>
        `<tr><td><table>${row
          .map((v, i) => {
            const style =
              i === 0
                ? ' style="color:#82b8b9"'
                : i === row.length - 1
                  ? ' style="color:#82c751"'
                  : "";
            return `<tr><td${style}>${i === 0 ? `<a href="#">${v}</a>` : v}</td></tr>`;
          })
          .join("")}</table></td></tr>`,
    )
    .join("")}</tbody></table>`,
);

run(
  "single-wrapper-div",
  `<table><tbody>${[vals, vals2, vals3]
    .map((row) => {
      const inner = row
        .map((v, i) => {
          if (i === 0) return `<span style="color:#82b8b9"><a href="#">${v}</a></span>`;
          if (i === row.length - 1) return `<span style="color:#82c751">${v}</span>`;
          return `<span>${v}</span>`;
        })
        .join("");
      return `<tr><td><div>${inner}</div></td></tr>`;
    })
    .join("")}</tbody></table>`,
);

run(
  "br-only-no-spaces",
  `<table><tbody>${[vals, vals2, vals3]
    .map((row) => {
      const inner = row
        .map((v, i) => {
          if (i === 0) return `<a href="#" style="color:#82b8b9">${v}</a>`;
          if (i === row.length - 1) return `<span style="color:#82c751">${v}</span>`;
          return v;
        })
        .join("<br>");
      return `<tr><td>${inner}</td></tr>`;
    })
    .join("")}</tbody></table>`,
);

run(
  "mat-row-div-chrome",
  `<!--StartFragment-->
${[vals, vals2, vals3]
  .map((row) => {
    const cells = row
      .map((v, i) => {
        const cls = i === row.length - 1 ? "mat-cell positive" : "mat-cell";
        const style =
          i === 0
            ? ' style="color:#82b8b9"'
            : i === row.length - 1
              ? ' style="color:#82c751"'
              : "";
        const body = i === 0 ? `<a href="#">${v}</a>` : v;
        return `<div class="${cls}" role="gridcell"${style}>${body}</div>`;
      })
      .join("");
    return `<div class="mat-row" role="row">${cells}</div>`;
  })
  .join("")}
<!--EndFragment-->`,
);

run(
  "excel-mso-normal",
  `<table><tbody>${[vals, vals2, vals3]
    .map((row) => {
      const inner = row
        .map((v, i) => {
          const color =
            i === 0 ? "color:#82b8b9;" : i === row.length - 1 ? "color:#82c751;" : "";
          return `<p class="MsoNormal" style="margin:0;${color}">${
            i === 0 ? `<a href="#">${v}</a>` : v
          }</p>`;
        })
        .join("");
      return `<tr><td>${inner}</td></tr>`;
    })
    .join("")}</tbody></table>`,
);

run(
  "one-cell-all-rows",
  (() => {
    const block = (row, link) =>
      row
        .map((v, i) => {
          if (i === 0 && link) return `<div style="color:#82b8b9"><a href="#">${v}</a></div>`;
          if (i === row.length - 1) return `<div style="color:#82c751">${v}</div>`;
          return `<div>${v}</div>`;
        })
        .join("");
    return `<table><tr><td>${block(vals, true)}${block(vals2, false)}${block(vals3, false)}</td></tr></table>`;
  })(),
);
