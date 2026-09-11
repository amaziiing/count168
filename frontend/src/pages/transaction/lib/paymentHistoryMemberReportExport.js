import { assetUrl, buildApiUrl } from "../../../utils/core/apiUrl.js";
import pdfBrandLogoUrl from "../../../assets/images/count_brandlogo.png?url";
import { formatDmyFromYmd } from "../../maintenance/shared/maintenanceDateHelpers.js";
import { computeTableTotals, formatPaymentHistoryMoney } from "../../member/memberPageHelpers.js";
import { parseJsonResponse } from "../../member/memberWinLossApi.js";
import { formatMemberRowDescription, getMemberText } from "../../../translateFile/pages/memberTranslate.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseMoneyNumber(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatMoneyHtml(value) {
  const n = parseMoneyNumber(value);
  const display = formatPaymentHistoryMoney(value);
  if (n === null) return '<span class="amt amt--empty">–</span>';
  if (n === 0) return '<span class="amt amt--zero">-</span>';
  const tone = n > 0 ? "pos" : "neg";
  return `<span class="amt amt--${tone}">${escapeHtml(display)}</span>`;
}

function moneyCellClass(value) {
  const n = parseMoneyNumber(value);
  if (n === 0) return "num num--zero";
  return "num";
}

/** Print CSS aligned with Member Win/Loss table (`member-winloss-table--by-currency`). */
const MEMBER_REPORT_PRINT_CSS = `
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body {
    width: 100%;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    color: #0f172a;
    font-size: 10pt;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-header {
    margin: 0 0 4px;
    padding-bottom: 5px;
    border-bottom: 2px solid #002c49;
  }
  .doc-title {
    margin: 0 0 4px;
    font-size: 14pt;
    font-weight: 700;
    color: #002c49;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .doc-meta {
    margin: 0;
    font-size: 9.5pt;
    font-weight: 600;
    color: #475569;
  }
  .report-section {
    margin: 0 0 18px;
    page-break-inside: avoid;
  }
  .report-section + .report-section {
    page-break-before: always;
    margin-top: 0;
    padding-top: 4px;
  }
  .section-title {
    margin: 0 0 8px;
    font-size: 11pt;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: 0.01em;
  }
  .section-meta {
    margin: 0 0 10px;
    font-size: 9pt;
    font-weight: 600;
    color: #64748b;
  }
  table.report-table {
    width: 100%;
    margin-top: 0;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid #e2e8f0;
    font-size: 9.5pt;
  }
  table.report-table col.col-date { width: 5%; }
  table.report-table col.col-product { width: 16%; }
  table.report-table col.col-rate { width: 5%; }
  table.report-table col.col-winloss,
  table.report-table col.col-crdr,
  table.report-table col.col-balance { width: 8%; }
  table.report-table col.col-description { width: 26%; }
  table.report-table col.col-remark { width: 24%; }
  table.report-table thead { display: table-header-group; }
  table.report-table tfoot { display: table-footer-group; }
  table.report-table th {
    background: #002c49;
    color: #ffffff;
    padding: 7px 8px;
    border: 1px solid #1e3a5f;
    font-size: 9.5pt;
    font-weight: 700;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }
  table.report-table th.col-rate,
  table.report-table th.col-winloss,
  table.report-table th.col-crdr,
  table.report-table th.col-balance {
    text-align: right;
  }
  table.report-table td {
    padding: 6px 8px;
    border: 1px solid #e8edf3;
    font-size: 9.5pt;
    font-weight: 600;
    color: #0f172a;
    vertical-align: middle;
    word-break: break-word;
  }
  table.report-table tbody tr:nth-child(odd) td { background: #f9fbff; }
  table.report-table tbody tr:nth-child(even) td { background: rgb(228, 235, 255); }
  table.report-table tbody tr.row-bf td {
    background: #eef4ff !important;
    color: #1e3a5f;
  }
  table.report-table td.col-date { white-space: nowrap; }
  table.report-table td.col-product { text-align: left; }
  table.report-table td.col-rate {
    text-align: right;
    color: #0f172a;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  table.report-table td.col-remark {
    text-align: center;
    color: #64748b;
    font-variant-numeric: tabular-nums;
  }
  table.report-table td.col-description {
    text-align: left;
    text-transform: uppercase;
  }
  table.report-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.report-table tbody td.num--zero { text-align: center; }
  table.report-table .amt {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    min-width: 3.5rem;
  }
  table.report-table .amt--pos { color: #172a9f; }
  table.report-table .amt--neg { color: #b91c1c; }
  table.report-table .amt--zero {
    color: #002c49;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  table.report-table .amt--empty {
    color: #cbd5e1;
    font-weight: 400;
  }
  table.report-table tr.total-row td {
    background: #eef4ff !important;
    color: #0f172a !important;
    font-weight: 700;
    border-color: #e2e8f0;
    border-top: 2px solid #d6e3f2;
  }
  table.report-table td.total-label {
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  table.report-table tr.total-row td.num { text-align: right; }
  @media print {
    body { width: auto; }
    .report-section { page-break-inside: auto; }
    table.report-table tr { page-break-inside: avoid; }
  }
`;

const REPORT_TABLE_COLGROUP = `<colgroup>
  <col class="col-date" />
  <col class="col-product" />
  <col class="col-rate" />
  <col class="col-winloss" />
  <col class="col-crdr" />
  <col class="col-balance" />
  <col class="col-description" />
  <col class="col-remark" />
</colgroup>`;

function productCell(row) {
  if (row?.is_bank_process_transaction) return row.card_owner || "-";
  return row?.product || "-";
}

function remarkCell(row) {
  const raw = row?.remark || row?.sms || "-";
  return String(raw).toUpperCase();
}

/** PDF remark text: preserve natural spacing/wrapping (no forced per-word line breaks). */
function pdfRemarkText(row) {
  return remarkCell(row);
}

/** Account currencies for export modal (member report scope). */
export async function fetchPaymentHistoryExportCurrencies(accountId, companyId, groupId, signal) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  const gid = String(groupId || "").trim().toUpperCase();
  if (!id || (!cid && !gid)) return [];
  const params = new URLSearchParams({
    action: "get_account_currencies",
    account_id: String(id),
    ...(gid ? { group_id: gid } : { company_id: String(cid) }),
  });
  const res = await fetch(
    buildApiUrl(`api/accounts/account_currency_api.php?${params}`),
    { credentials: "include", cache: "no-store", signal },
  );
  const json = await parseJsonResponse(await res.text());
  if (!json?.success || !Array.isArray(json.data)) return [];
  return json.data
    .map((row) =>
      String(row.currency_code || row.code || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
}

/**
 * Member Win/Loss table rows — same request + same formatting as the Member page.
 * `member_view=1` forces the backend to apply the member-side description rules
 * (PAYMENT → Payment Settlement, CLAIM → Claim Settlement, RATE → Currency Exchange,
 * CONTRA → Contra Account) even when an agent/admin triggers the export.
 */
export async function fetchMemberReportHistory({ accountId, companyId, groupId, dateFrom, dateTo, currency, signal }) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  const gid = String(groupId || "").trim().toUpperCase();
  if (!id || (!cid && !gid)) {
    throw new Error("Account or company is missing");
  }
  const params = new URLSearchParams({
    account_id: String(id),
    date_from: String(dateFrom),
    date_to: String(dateTo),
    ...(gid ? { group_id: gid } : { company_id: String(cid) }),
    currency: String(currency || "")
      .trim()
      .toUpperCase(),
    member_view: "1",
  });
  const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await parseJsonResponse(await res.text());
  if (!json?.success) {
    throw new Error(json?.error || json?.message || "History request failed");
  }
  return Array.isArray(json.data?.history) ? json.data.history : [];
}

export function resolveExportCurrencyDefault(scopeCurrency, currencies) {
  return resolveExportCurrenciesDefault(scopeCurrency, currencies).codes[0] || "";
}

/** Initial multi-select state for export modal (comma-separated scope currency or ALL). */
export function resolveExportCurrenciesDefault(scopeCurrency, currencies) {
  const list = Array.isArray(currencies) ? currencies : [];
  if (!list.length) {
    return { isAllSelected: true, codes: [] };
  }
  if (list.length === 1) {
    return { isAllSelected: false, codes: [list[0]] };
  }
  const raw = String(scopeCurrency || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "ALL") {
    return { isAllSelected: true, codes: [] };
  }
  const parts = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const matched = parts.filter((p) => list.includes(p));
  if (!matched.length) {
    return { isAllSelected: true, codes: [] };
  }
  if (matched.length === list.length) {
    return { isAllSelected: true, codes: [] };
  }
  return { isAllSelected: false, codes: matched };
}

export function exportCurrencyCodes(isAllSelected, selectedCurrencies, availableCurrencies) {
  const list = Array.isArray(availableCurrencies) ? availableCurrencies : [];
  if (!list.length) return [];
  if (list.length === 1) {
    const code = list[0];
    return (selectedCurrencies || []).includes(code) ? [code] : [];
  }
  if (isAllSelected) return [...list];
  return (selectedCurrencies || []).filter((c) => list.includes(c));
}

export function ymdRangeToDmy(dateFromYmd, dateToYmd) {
  return {
    dateFrom: formatDmyFromYmd(dateFromYmd),
    dateTo: formatDmyFromYmd(dateToYmd),
  };
}

function buildReportTableHead(headers) {
  const colClasses = [
    "col-date",
    "col-product",
    "col-rate",
    "col-winloss",
    "col-crdr",
    "col-balance",
    "col-description",
    "col-remark",
  ];
  const cells = headers
    .map((h, i) => `<th class="${colClasses[i] || ""}">${escapeHtml(h)}</th>`)
    .join("");
  return `<thead><tr>${cells}</tr></thead>`;
}

function buildReportDataRowHtml(row, lang) {
  const bfClass = row?.row_type === "bf" ? " row-bf" : "";
  return `<tr class="data-row${bfClass}">
    <td class="col-date">${escapeHtml(row.date || "-")}</td>
    <td class="col-product">${escapeHtml(productCell(row))}</td>
    <td class="col-rate">${escapeHtml(row.rate || "-")}</td>
    <td class="${moneyCellClass(row.win_loss)}">${formatMoneyHtml(row.win_loss)}</td>
    <td class="${moneyCellClass(row.cr_dr)}">${formatMoneyHtml(row.cr_dr)}</td>
    <td class="${moneyCellClass(row.balance)}">${formatMoneyHtml(row.balance)}</td>
    <td class="col-description">${escapeHtml(formatMemberRowDescription(lang, row))}</td>
    <td class="col-remark">${escapeHtml(remarkCell(row))}</td>
  </tr>`;
}

function buildReportFooterHtml(totalLabel, totalWinLoss, totalCrDr, closingBalance) {
  return `<tfoot><tr class="total-row">
    <td class="total-label" colspan="3">${escapeHtml(totalLabel)}</td>
    <td class="num">${formatMoneyHtml(totalWinLoss.toString())}</td>
    <td class="num">${formatMoneyHtml(totalCrDr.toString())}</td>
    <td class="num">${formatMoneyHtml(closingBalance.toString())}</td>
    <td colspan="2"></td>
  </tr></tfoot>`;
}

function buildPrintShellHtml({ documentTitle, bodyContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>${MEMBER_REPORT_PRINT_CSS}</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

function buildPrintDocumentHtml({ title, subtitle, headers, rows, footerLabel, totalWinLoss, totalCrDr, closingBalance, lang }) {
  const head = buildReportTableHead(headers);
  const body = (rows || []).map((row) => buildReportDataRowHtml(row, lang)).join("");
  const foot = buildReportFooterHtml(footerLabel, totalWinLoss, totalCrDr, closingBalance);
  const content = `
  <header class="doc-header">
    <h1 class="doc-title">${escapeHtml(title)}</h1>
    <p class="doc-meta">${escapeHtml(subtitle)}</p>
  </header>
  <table class="report-table">
    ${REPORT_TABLE_COLGROUP}
    ${head}
    <tbody>${body}</tbody>
    ${foot}
  </table>`;
  return buildPrintShellHtml({ documentTitle: title, bodyContent: content });
}

export function buildMemberReportPrintHtml({
  rows,
  currency,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const section = buildMemberReportSectionData({
    rows,
    currency,
    accountCode,
    accountName,
    dateFrom,
    dateTo,
    lang,
  });
  return buildPrintDocumentHtml({
    title: section.docTitle,
    subtitle: section.docMeta,
    headers: section.headers,
    rows: section.rows,
    footerLabel: section.footerLabel,
    totalWinLoss: section.totalWinLoss,
    totalCrDr: section.totalCrDr,
    closingBalance: section.closingBalance,
    lang,
  });
}

function buildMemberReportSectionData({
  rows,
  currency,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const t = (key, params) => getMemberText(lang, key, params);
  const { totalWinLoss, totalCrDr, closingBalance } = computeTableTotals(rows);
  const accountLabel = `${accountCode}${accountName ? ` (${accountName})` : ""}`;
  const dateLabel = `${dateFrom} – ${dateTo}`;
  return {
    currencyTitle: t("currencyTitle", { currency }),
    docTitle: `${accountCode} - ${t("exportPdfTitle")}`,
    docMeta: `${accountLabel} · ${dateLabel}`,
    sectionMeta: `${accountLabel} · ${dateLabel}`,
    headers: [
      t("colDate"),
      t("colIdProduct"),
      t("colRate"),
      t("colWinLoss"),
      t("colCrDr"),
      t("colBalance"),
      t("colDescription"),
      t("colRemark"),
    ],
    rows: rows || [],
    footerLabel: t("totalRow", { currency }),
    totalWinLoss,
    totalCrDr,
    closingBalance,
  };
}

function buildMemberReportSectionHtml(sectionData, lang) {
  const head = buildReportTableHead(sectionData.headers);
  const body = (sectionData.rows || []).map((row) => buildReportDataRowHtml(row, lang)).join("");
  const foot = buildReportFooterHtml(
    sectionData.footerLabel,
    sectionData.totalWinLoss,
    sectionData.totalCrDr,
    sectionData.closingBalance,
  );
  return `<section class="report-section">
  <h2 class="section-title">${escapeHtml(sectionData.currencyTitle)}</h2>
  <p class="section-meta">${escapeHtml(sectionData.sectionMeta)}</p>
  <table class="report-table">
    ${REPORT_TABLE_COLGROUP}
    ${head}
    <tbody>${body}</tbody>
    ${foot}
  </table>
</section>`;
}

/** One print document with a table per selected currency (page break between sections). */
export function buildCombinedMemberReportPrintHtml({
  sections,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const firstSection = buildMemberReportSectionData({
    rows: sections?.[0]?.rows || [],
    currency: sections?.[0]?.currency || "",
    accountCode,
    accountName,
    dateFrom,
    dateTo,
    lang,
  });
  const sectionHtml = (sections || [])
    .map(({ currency, rows }) =>
      buildMemberReportSectionHtml(
        buildMemberReportSectionData({
          rows,
          currency,
          accountCode,
          accountName,
          dateFrom,
          dateTo,
          lang,
        }),
        lang,
      ),
    )
    .join("");
  const docTitle = firstSection.docTitle;
  const bodyContent = `
  <header class="doc-header">
    <h1 class="doc-title">${escapeHtml(firstSection.docTitle)}</h1>
    <p class="doc-meta">${escapeHtml(firstSection.docMeta)}</p>
  </header>
  ${sectionHtml}`;

  return buildPrintShellHtml({ documentTitle: docTitle, bodyContent });
}

/**
 * Open the print window synchronously (must run inside the click handler so the
 * browser keeps the user-gesture context — otherwise it becomes a blocked/blank tab).
 */
export function openReportPrintWindow(loadingLabel = "Loading…") {
  const win = window.open("", "_blank");
  if (!win) return null;
  win.document.open();
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(loadingLabel)}</title>` +
      `<style>body{font-family:"Segoe UI",Arial,sans-serif;color:#475569;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>` +
      `</head><body>${escapeHtml(loadingLabel)}</body></html>`,
  );
  win.document.close();
  return win;
}

/** Render report HTML into an already-opened window and trigger the print dialog. */
export function renderReportToWindow(win, { html, documentTitle }) {
  if (!win || win.closed) throw new Error("Popup blocked");
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.document.title = documentTitle;
  } catch {
    /* ignore */
  }
  const triggerPrint = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 300);
  } else {
    win.addEventListener("load", () => window.setTimeout(triggerPrint, 300));
  }
}

function rowToTableCells(row, lang) {
  return [
    row.date || "-",
    productCell(row),
    row.rate || "-",
    formatPaymentHistoryMoney(row.win_loss),
    formatPaymentHistoryMoney(row.cr_dr),
    formatPaymentHistoryMoney(row.balance),
    formatMemberRowDescription(lang, row),
    pdfRemarkText(row),
  ];
}

function moneyTone(value) {
  const n = parseMoneyNumber(value);
  if (n === null) return "empty";
  if (n === 0) return "zero";
  return n > 0 ? "pos" : "neg";
}

function applyPdfMoneyStyle(cell, rawValue) {
  const tone = moneyTone(rawValue);
  cell.styles.halign = "right";
  cell.styles.overflow = "hidden";
  cell.styles.whiteSpace = "nowrap";
  if (tone === "pos") {
    cell.styles.textColor = [23, 42, 159];
    cell.styles.fontStyle = "bold";
  } else if (tone === "neg") {
    cell.styles.textColor = [185, 28, 28];
    cell.styles.fontStyle = "bold";
  } else if (tone === "zero") {
    cell.styles.textColor = [0, 44, 73];
    cell.styles.fontStyle = "bold";
    cell.styles.halign = "center";
  } else {
    cell.styles.textColor = [203, 213, 225];
    cell.styles.fontStyle = "normal";
    cell.styles.halign = "center";
  }
}

function applyPdfCjkCellStyle(cell, { columnIndex, inHeader = false } = {}) {
  // Keep CJK rows visually aligned with UI: slightly larger line-height for
  // wrapped Description/Remark text.
  const isDescription = columnIndex === 6;
  const isRemark = columnIndex === 7;
  if (inHeader) {
    cell.styles.fontSize = 9;
    cell.styles.lineHeight = 1.08;
    return;
  }
  if (!isDescription && !isRemark) return;
  cell.styles.fontSize = 8.7;
  cell.styles.lineHeight = 1.08;
  if (isDescription) {
    cell.styles.halign = "left";
    cell.styles.overflow = "linebreak";
  }
  if (isRemark) {
    cell.styles.halign = "left";
    cell.styles.overflow = "linebreak";
  }
}

const PDF_LOGO_PATH = "images/count_brandlogo.png";
const PDF_LOGO_HEIGHT_MM = 8;
const PDF_LOGO_TOP_TRIM_MM = 1.1;
const PDF_TITLE_FONT_PT = 14;
const PDF_META_FONT_PT = 9;
const PDF_CURRENCY_FONT_PT = 11;
const PDF_FALLBACK_FONT_FAMILY = "helvetica";
const PDF_CJK_FONT_FAMILY = "NotoSansCJKsc";
const PDF_CJK_FONT_FILE = "NotoSansCJKsc-VF.ttf";
const PDF_CJK_FONT_URLS = [
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/Variable/TTF/NotoSansCJKsc-VF.ttf",
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/Variable/TTF/NotoSansCJKsc-VF.ttf",
];
/**
 * jsPDF's font embedding only understands classic TrueType outlines (glyf/loca) and
 * has no variable-font (fvar/wght axis) support, so it can only ever render the
 * default (Regular) master baked into PDF_CJK_FONT_FILE above — asking for "bold"
 * from that file silently renders the same thin glyphs. This is a real static
 * Bold instance (weight 700) sliced from the same Noto Sans SC source, served by
 * Google Fonts as plain TrueType, so it gives jsPDF actual bold glyph outlines.
 */
const PDF_CJK_BOLD_FONT_FILE = "NotoSansSC-Bold.ttf";
const PDF_CJK_BOLD_FONT_URLS = [
  "https://fonts.gstatic.com/s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaGzjCra5HaN7R9HA.ttf",
];
const PDF_HEADER_TOP_MM = 8;
const PDF_FIRST_PAGE_TOP_MARGIN_MM = 24;
const PDF_OTHER_PAGE_TOP_MARGIN_MM = 18;
/** 分割线（doc-header 底边）与表头之间的垂直留白 */
const PDF_HEADER_TABLE_GAP_MM = 1.5;
const PDF_HEADER_META_SEP_GAP_MM = 1.5;
const PDF_BRAND_BAR_RGB = [0, 44, 73];
const PDF_FOOTER_BOTTOM_MM = 10;
let pdfCjkFontBase64Promise = null;
let pdfCjkBoldFontBase64Promise = null;

function resolvePdfLogoUrls(relativePath) {
  const clean = String(relativePath || "").replace(/^\//, "");
  const urls = [];
  const base = String(import.meta.env?.BASE_URL || "/");
  const basePath = base.endsWith("/") ? base : `${base}/`;
  urls.push(new URL(clean, `${window.location.origin}${basePath}`).href);
  urls.push(assetUrl(clean));
  urls.push(new URL(`/${clean}`, window.location.origin).href);
  return [...new Set(urls)];
}

async function loadPdfLogoAsset() {
  const urls = [pdfBrandLogoUrl, ...resolvePdfLogoUrls(PDF_LOGO_PATH)];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        cache: "force-cache",
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        img.onerror = () => resolve({ w: 1, h: 1 });
        img.src = dataUrl;
      });
      if (dims.w > 1 && dims.h > 1) {
        return { dataUrl, dims };
      }
    } catch {
      /* try next URL */
    }
  }
  return null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchPdfFontBase64(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        credentials: "omit",
        cache: "force-cache",
      });
      if (!res.ok) continue;
      const dataUrl = await blobToDataUrl(await res.blob());
      const payload = dataUrl.split(",")[1] || "";
      if (payload) return payload;
    } catch {
      /* try next URL */
    }
  }
  throw new Error("Unable to load font for PDF export");
}

function addFontToVfsOnce(doc, file, base64) {
  const hasFile =
    typeof doc.existsFileInVFS === "function" ? doc.existsFileInVFS(file) : false;
  if (!hasFile) {
    doc.addFileToVFS(file, base64);
  }
}

async function ensurePdfExportFont(doc) {
  try {
    if (!pdfCjkFontBase64Promise) {
      pdfCjkFontBase64Promise = fetchPdfFontBase64(PDF_CJK_FONT_URLS);
    }
    let base64 = "";
    try {
      base64 = await pdfCjkFontBase64Promise;
    } catch {
      pdfCjkFontBase64Promise = null;
      throw new Error("CJK font fetch failed");
    }
    addFontToVfsOnce(doc, PDF_CJK_FONT_FILE, base64);
    doc.addFont(PDF_CJK_FONT_FILE, PDF_CJK_FONT_FAMILY, "normal");

    // Real static Bold TrueType instance — falls back to the regular file (best
    // effort, still thin) if the network request fails, so export never breaks.
    try {
      if (!pdfCjkBoldFontBase64Promise) {
        pdfCjkBoldFontBase64Promise = fetchPdfFontBase64(PDF_CJK_BOLD_FONT_URLS);
      }
      const boldBase64 = await pdfCjkBoldFontBase64Promise;
      addFontToVfsOnce(doc, PDF_CJK_BOLD_FONT_FILE, boldBase64);
      doc.addFont(PDF_CJK_BOLD_FONT_FILE, PDF_CJK_FONT_FAMILY, "bold");
    } catch {
      pdfCjkBoldFontBase64Promise = null;
      doc.addFont(PDF_CJK_FONT_FILE, PDF_CJK_FONT_FAMILY, "bold");
    }

    return PDF_CJK_FONT_FAMILY;
  } catch {
    return null;
  }
}

function hasCjkText(value) {
  const text = String(value || "");
  if (!text) return false;
  return /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(text);
}

function resolvePdfFontFamilyForText(text, cjkFontFamily) {
  if (cjkFontFamily && hasCjkText(text)) return cjkFontFamily;
  return PDF_FALLBACK_FONT_FAMILY;
}

function setPdfFontForText(doc, text, cjkFontFamily, style = "normal") {
  doc.setFont(resolvePdfFontFamilyForText(text, cjkFontFamily), style);
}

function pdfCapHeightMm(fontSizePt) {
  return fontSizePt * 0.352778 * 0.72;
}

function pdfLineHeightMm(fontSizePt) {
  return fontSizePt * 0.352778 * 1.15;
}

function drawPdfPageHeader(doc, { logo, pageW, marginX, title, meta, currencyTitle, showTitle, showLogo, cjkFontFamily }) {
  const capTopY = PDF_HEADER_TOP_MM;
  let blockBottomY = capTopY;
  const leftX = marginX;

  let logoImgW = 0;
  if (showLogo && logo?.dataUrl) {
    const imgH = PDF_LOGO_HEIGHT_MM;
    const imgW = imgH * (logo.dims.w / logo.dims.h);
    logoImgW = imgW;
    const logoTopY = capTopY - PDF_LOGO_TOP_TRIM_MM;
    doc.addImage(logo.dataUrl, "PNG", pageW - marginX - imgW, logoTopY, imgW, imgH);
    blockBottomY = Math.max(blockBottomY, logoTopY + imgH);
  }

  const titleMaxW = pageW - marginX * 2 - (logoImgW > 0 ? logoImgW + 4 : 0);

  if (showTitle && title) {
    setPdfFontForText(doc, title, cjkFontFamily, "bold");
    doc.setFontSize(PDF_TITLE_FONT_PT);
    doc.setTextColor(PDF_BRAND_BAR_RGB[0], PDF_BRAND_BAR_RGB[1], PDF_BRAND_BAR_RGB[2]);
    const titleBaselineY = capTopY + pdfCapHeightMm(PDF_TITLE_FONT_PT);
    doc.text(title, leftX, titleBaselineY, { align: "left", maxWidth: titleMaxW });
    blockBottomY = Math.max(blockBottomY, titleBaselineY);
    if (meta) {
      setPdfFontForText(doc, meta, cjkFontFamily, "normal");
      doc.setFontSize(PDF_META_FONT_PT);
      doc.setTextColor(100, 116, 139);
      const metaBaselineY = titleBaselineY + pdfLineHeightMm(PDF_META_FONT_PT);
      doc.text(meta, leftX, metaBaselineY, { align: "left", maxWidth: titleMaxW });
      blockBottomY = Math.max(blockBottomY, metaBaselineY);
    }
  }

  if (currencyTitle) {
    const currencyBaselineY = blockBottomY + 2 + pdfCapHeightMm(PDF_CURRENCY_FONT_PT);
    setPdfFontForText(doc, currencyTitle, cjkFontFamily, "bold");
    doc.setFontSize(PDF_CURRENCY_FONT_PT);
    doc.setTextColor(PDF_BRAND_BAR_RGB[0], PDF_BRAND_BAR_RGB[1], PDF_BRAND_BAR_RGB[2]);
    doc.text(currencyTitle, leftX, currencyBaselineY, { align: "left", maxWidth: titleMaxW });
    blockBottomY = Math.max(blockBottomY, currencyBaselineY);
  }

  const sepY = blockBottomY + PDF_HEADER_META_SEP_GAP_MM;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.35);
  doc.line(marginX, sepY, pageW - marginX, sepY);
  return sepY + PDF_HEADER_TABLE_GAP_MM;
}

function drawPdfSectionCurrencyHeading(doc, { pageW, marginX, startY, currencyTitle, cjkFontFamily }) {
  const titleMaxW = pageW - marginX * 2;
  const currencyBaselineY = startY + pdfCapHeightMm(PDF_CURRENCY_FONT_PT);
  setPdfFontForText(doc, currencyTitle, cjkFontFamily, "bold");
  doc.setFontSize(PDF_CURRENCY_FONT_PT);
  doc.setTextColor(PDF_BRAND_BAR_RGB[0], PDF_BRAND_BAR_RGB[1], PDF_BRAND_BAR_RGB[2]);
  doc.text(currencyTitle, marginX, currencyBaselineY, { align: "left", maxWidth: titleMaxW });
  const sepY = currencyBaselineY + PDF_HEADER_META_SEP_GAP_MM;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.35);
  doc.line(marginX, sepY, pageW - marginX, sepY);
  return sepY + PDF_HEADER_TABLE_GAP_MM;
}

function drawPdfPageFooter(doc, { pageW, pageH, pageLabel, cjkFontFamily }) {
  setPdfFontForText(doc, pageLabel, cjkFontFamily, "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(pageLabel, pageW / 2, pageH - PDF_FOOTER_BOTTOM_MM, { align: "center" });
}

/** A4 landscape — 277mm; Id Product wider (no truncate), Rate readable. */
const PDF_TABLE_COLUMN_STYLES = {
  0: { cellWidth: 16,halign: "left", overflow: "hidden", fontStyle: "bold" }, // Date
  1: { cellWidth: 42, halign: "left", overflow: "linebreak", fontStyle: "bold" }, // Id Product
  2: { cellWidth: 18, halign: "right", overflow: "hidden", fontStyle: "bold" }, // Rate
  3: { cellWidth: 24,halign: "right", overflow: "hidden" }, // Win/Loss
  4: { cellWidth: 24,halign: "right", overflow: "hidden" }, // Cr/Dr
  5: { cellWidth: 26,halign: "right", overflow: "hidden" }, // Balance
  6: { cellWidth: 64,halign: "left", overflow: "linebreak" }, // Description
  7: { cellWidth: 63,halign: "left", overflow: "linebreak" }, // Remark
};

/**
 * Generate a proper A4 landscape PDF and trigger download (no browser print dialog).
 */
export async function downloadMemberReportPdf({
  sections,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
  filename,
}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const cjkFontFamily = await ensurePdfExportFont(doc);
  const logo = await loadPdfLogoAsset();

  const headerSection = buildMemberReportSectionData({
    rows: sections?.[0]?.rows || [],
    currency: sections?.[0]?.currency || "",
    accountCode,
    accountName,
    dateFrom,
    dateTo,
    lang,
  });

  const t = (key, params) => getMemberText(lang, key, params);
  let cursorY = PDF_FIRST_PAGE_TOP_MARGIN_MM;
  const headerPagesDrawn = new Set();
  let pendingCurrencyHeading = null;

  const sectionList = sections || [];
  const multiCurrency = sectionList.length > 1;

  // 首页表头必须在 autoTable 之前绘制并锁定 startY；didDrawPage 里改 margin.top 对已落笔的表无效。
  let firstPageTableStartY = PDF_FIRST_PAGE_TOP_MARGIN_MM;
  if (sectionList.length > 0) {
    firstPageTableStartY = drawPdfPageHeader(doc, {
      logo,
      pageW,
      marginX,
      title: headerSection.docTitle,
      meta: headerSection.docMeta,
      currencyTitle: multiCurrency ? headerSection.currencyTitle : null,
      showTitle: true,
      showLogo: true,
      cjkFontFamily,
    });
    headerPagesDrawn.add(1);
  }

  sectionList.forEach((section, sectionIdx) => {
    const sectionData = buildMemberReportSectionData({
      rows: section.rows,
      currency: section.currency,
      accountCode,
      accountName,
      dateFrom,
      dateTo,
      lang,
    });
    const sourceRows = section.rows || [];
    let tableStartY = sectionIdx === 0 ? firstPageTableStartY : cursorY;

    if (multiCurrency && sectionIdx > 0) {
      if (cursorY > pageH - 40) {
        doc.addPage();
        tableStartY = undefined;
        pendingCurrencyHeading = sectionData.currencyTitle;
      } else {
        tableStartY = drawPdfSectionCurrencyHeading(doc, {
          pageW,
          marginX,
          startY: cursorY,
          currencyTitle: sectionData.currencyTitle,
          cjkFontFamily,
        });
      }
    }

    const body = sourceRows.map((row) => rowToTableCells(row, lang));
    const foot = [
      [
        {
          content: sectionData.footerLabel,
          colSpan: 3,
          styles: { halign: "left", fontStyle: "bold" },
        },
        formatPaymentHistoryMoney(sectionData.totalWinLoss.toString()),
        formatPaymentHistoryMoney(sectionData.totalCrDr.toString()),
        formatPaymentHistoryMoney(sectionData.closingBalance.toString()),
        { content: "", colSpan: 2 },
      ],
    ];

    autoTable(doc, {
      startY: tableStartY,
      margin: {
        top: sectionIdx === 0 ? firstPageTableStartY : PDF_OTHER_PAGE_TOP_MARGIN_MM,
        left: marginX,
        right: marginX,
        bottom: PDF_FOOTER_BOTTOM_MM + 4,
      },
      tableWidth: pageW - marginX * 2,
      head: [sectionData.headers],
      body,
      foot,
      showFoot: "lastPage",
      theme: "grid",
      didDrawPage: (hookData) => {
        const docPage = doc.internal.getCurrentPageInfo().pageNumber;

        if (!headerPagesDrawn.has(docPage)) {
          headerPagesDrawn.add(docPage);
          let tableTopY = PDF_OTHER_PAGE_TOP_MARGIN_MM;
          if (pendingCurrencyHeading) {
            tableTopY = drawPdfSectionCurrencyHeading(doc, {
              pageW,
              marginX,
              startY: PDF_HEADER_TOP_MM,
              currencyTitle: pendingCurrencyHeading,
              cjkFontFamily,
            });
            pendingCurrencyHeading = null;
          }
          hookData.settings.margin.top = tableTopY;
        }

        drawPdfPageFooter(doc, {
          pageW,
          pageH,
          pageLabel: t("exportPdfPageLabel", { page: docPage }),
          cjkFontFamily,
        });
      },
      styles: {
        font: PDF_FALLBACK_FONT_FAMILY,
        fontSize: 9,
        cellPadding: { top: 0.8, right: 1.2, bottom: 0.8, left: 1.2 },
        lineColor: [232, 237, 243],
        lineWidth: 0.2,
        textColor: [0, 0, 0],
        overflow: "hidden",
        valign: "middle",
        fillColor: [249, 251, 255],
      },
      headStyles: {
        fillColor: [0, 44, 73],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
        minCellHeight: 5.8,
        valign: "middle",
      },
      footStyles: {
        fillColor: [238, 244, 255],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [228, 235, 255] },
      columnStyles: PDF_TABLE_COLUMN_STYLES,
      didParseCell: (hookData) => {
        const colIdx = hookData.column.index;
        const cellText = Array.isArray(hookData.cell?.text) ? hookData.cell.text.join(" ") : String(hookData.cell?.raw || "");
        const isDescOrRemarkBody = hookData.section === "body" && (colIdx === 6 || colIdx === 7);
        const isCjkCell = !!(cjkFontFamily && hasCjkText(cellText));
        if (isDescOrRemarkBody) {
          // Enforce unified typography for Description + Remark columns.
          hookData.cell.styles.font = resolvePdfFontFamilyForText(cellText, cjkFontFamily);
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fontSize = 9;
          hookData.cell.styles.lineHeight = 1.0;
          hookData.cell.styles.halign = "left";
          hookData.cell.styles.overflow = "linebreak";
          hookData.cell.styles.textColor = [0, 0, 0];
        }
        if (isCjkCell && !isDescOrRemarkBody) {
          hookData.cell.styles.font = cjkFontFamily;
          applyPdfCjkCellStyle(hookData.cell, {
            columnIndex: colIdx,
            inHeader: hookData.section === "head",
          });
        }
        if (hookData.section === "head") {
          hookData.cell.styles.cellPadding = { top: 1, right: 1.2, bottom: 1, left: 1.2 };
        }
        if (hookData.section === "body") {
          const row = sourceRows[hookData.row.index];
          if (row?.row_type === "bf") {
            hookData.cell.styles.fillColor = [238, 244, 255];
            hookData.cell.styles.textColor = [30, 58, 95];
          }
          if (colIdx === 0) {
            hookData.cell.styles.overflow = "hidden";
            hookData.cell.styles.whiteSpace = "nowrap";
          }
          if (colIdx === 3) applyPdfMoneyStyle(hookData.cell, row?.win_loss);
          if (colIdx === 4) applyPdfMoneyStyle(hookData.cell, row?.cr_dr);
          if (colIdx === 5) applyPdfMoneyStyle(hookData.cell, row?.balance);
          if (colIdx === 6 && !isDescOrRemarkBody) {
            hookData.cell.styles.fontStyle = "bold";
            hookData.cell.styles.overflow = "linebreak";
            hookData.cell.styles.textColor = [0, 0, 0];
          }
          if (colIdx === 7 && !isDescOrRemarkBody) {
            hookData.cell.styles.fontStyle = "bold";
            hookData.cell.styles.overflow = "linebreak";
            hookData.cell.styles.halign = "left";
            hookData.cell.styles.textColor = [0, 0, 0];
          }
          if (colIdx === 1) {
            hookData.cell.styles.overflow = "linebreak";
            hookData.cell.styles.fontStyle = "bold";
            hookData.cell.styles.textColor = [0, 0, 0];
          }
          if (colIdx === 2) {
            hookData.cell.styles.textColor = [0, 0, 0];
            hookData.cell.styles.fontStyle = "bold";
          }
        }
        if (hookData.section === "foot") {
          const col = hookData.column.index;
          if (col === 3) applyPdfMoneyStyle(hookData.cell, sectionData.totalWinLoss.toString());
          if (col === 4) applyPdfMoneyStyle(hookData.cell, sectionData.totalCrDr.toString());
          if (col === 5) applyPdfMoneyStyle(hookData.cell, sectionData.closingBalance.toString());
          if (col === 6 || col === 7) {
            hookData.cell.styles.overflow = "linebreak";
          }
        }
      },
    });

    cursorY = (doc.lastAutoTable?.finalY || tableStartY || PDF_FIRST_PAGE_TOP_MARGIN_MM) + 12;
    pendingCurrencyHeading = null;
  });

  const safeName = String(filename || "WinLoss-Report").replace(/[<>:"/\\|?*]+/g, "_");
  doc.save(`${safeName}.pdf`);
}

export function buildMemberReportFilename({ accountCode, currency, currencies, dateFrom, dateTo }) {
  const code = String(accountCode || "account").replace(/[^\w.-]+/g, "_");
  const list = Array.isArray(currencies) && currencies.length
    ? currencies
    : [String(currency || "CCY").toUpperCase()];
  const cu =
    list.length === 1
      ? list[0]
      : list.length <= 3
        ? list.join("-")
        : "MULTI";
  const from = String(dateFrom || "").replace(/\//g, "-");
  const to = String(dateTo || "").replace(/\//g, "-");
  return `WinLoss-${code}-${cu}-${from}-${to}`;
}
