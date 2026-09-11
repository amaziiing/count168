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
  DOMParser: window.DOMParser,
});

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { formatBodyMatrixLooksCollapsed } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
);

const stackHtml =
  "<a href=\"#\">SDSPDA95</a><br>7,182<br>$0.00<br>$12,390.95<br>$12,390.95<br>$10,806.00<br>$12,390.95<br>$0.00<br>$1,584.95";
const stackVal =
  "SDSPDA95\n7,182\n$0.00\n$12,390.95\n$12,390.95\n$10,806.00\n$12,390.95\n$0.00\n$1,584.95";
const body = [
  [{ value: stackVal, html: stackHtml }],
  [
    {
      value: "SUBTOTAL\n7,182\n$0.00\n$12,390.95\n$12,390.95",
      html: "<b>SUBTOTAL</b><br>7,182<br>$0.00<br>$12,390.95<br>$12,390.95",
    },
  ],
];

console.log("stacked body collapsed?", formatBodyMatrixLooksCollapsed(body, [1, 2]));

// Simulate: object patches where value is single-line joined, html has brs
const body2 = [
  [
    {
      value: stackVal.replace(/\n/g, " "),
      html: stackHtml,
    },
  ],
];
console.log("joined value collapsed?", formatBodyMatrixLooksCollapsed(body2, [1]));

// Simulate apply using ONLY html with block children, value = first token only
const body3 = [
  [
    {
      value: "SDSPDA95",
      html: "<div>SDSPDA95</div><div>7,182</div><div>$0.00</div><div>$12,390.95</div><div>$12,390.95</div><div>$10,806.00</div><div>$12,390.95</div><div>$0.00</div><div>$1,584.95</div>",
    },
  ],
  [
    {
      value: "SUBTOTAL",
      html: "<div>SUBTOTAL</div><div>7,182</div><div>$0.00</div><div>$12,390.95</div><div>$12,390.95</div>",
    },
  ],
];
console.log("value-first html-stack collapsed?", formatBodyMatrixLooksCollapsed(body3, [1, 2]));
