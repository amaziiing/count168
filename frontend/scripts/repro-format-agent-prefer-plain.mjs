/**
 * Prefer plain dual for agent_period (~9 cols + $); statement sheets (serial + 16 cols) do not match.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

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
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);

const fields = [
  "SDSPDA95",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
];
const agentMatrix = parsePlainTextMatrix(fields.concat(["Subtotal", ...fields.slice(1)]).join("\n"));

const statementPlain = [
  "1\tOB\tRS\t9714\t7054992\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0",
  "2\tOC\tXX\t1\t2\t3\t4\t5\t6\t7\t8\t9\t0\t1\t2\t3",
].join("\n");
const statementMatrix = parsePlainTextMatrix(statementPlain);

const width = (m) => m?.[0]?.length || 0;
const checks = {
  agentMulti: width(agentMatrix) >= 9 && width(agentMatrix) <= 12,
  agentHasDollar: (agentMatrix[0] || []).some((c) => /\$/.test(String(c))),
  agentNotSerial: !/^\d+$/.test(String(agentMatrix[0]?.[0] || "")),
  statementWide: width(statementMatrix) > 12,
  statementSerial: /^\d+$/.test(String(statementMatrix[0]?.[0] || "")),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, agentW: width(agentMatrix), stmtW: width(statementMatrix) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS agent_period prefer-plain heuristics");
