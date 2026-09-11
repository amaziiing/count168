import { buildApiUrl } from "../utils/apiUrl.js";
import { fetchJson } from "./fetchJson.js";

/** Same keys as desktop `frontend/src/utils/company/currencyDisplayOrder.js`. */
export const CURRENCY_DISPLAY_ORDER_LS_PREFIX = "eazycount:currency_display_order:";
export const USER_CURRENCY_DISPLAY_ORDER_LS_KEY = "eazycount:user_currency_display_order";

/** Apply saved user/company order; unknown codes append after ordered ones. */
export function mergeCurrencyCodesWithSavedOrder(baseCodes, savedOrder) {
  if (!Array.isArray(baseCodes) || !baseCodes.length) return [];
  const codes = baseCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (!Array.isArray(savedOrder) || !savedOrder.length) return codes;
  const set = new Set(codes);
  const ordered = savedOrder
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => set.has(c));
  const rest = codes.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

export function readCurrencyDisplayOrder(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  try {
    const raw = localStorage.getItem(`${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${cid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

export function readUserCurrencyDisplayOrder() {
  try {
    const raw = localStorage.getItem(USER_CURRENCY_DISPLAY_ORDER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

/**
 * Saved pill order for this company.
 * localStorage wins when present (last drag on this browser); otherwise use API.
 */
export function resolveSavedCurrencyOrder(companyId, apiOrder) {
  const userGlobal = readUserCurrencyDisplayOrder();
  if (userGlobal?.length) return userGlobal;
  const fromLs = readCurrencyDisplayOrder(companyId);
  if (fromLs?.length) return fromLs;
  const fromApi = Array.isArray(apiOrder)
    ? apiOrder.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  return fromApi.length ? fromApi : null;
}

/**
 * Reorder filter currency codes to match desktop per-company order
 * (user drag / localStorage / user_currency_order_api). Falls back to API list order.
 */
export async function orderCurrencyCodesForCompany(codes, companyId, signal) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  }

  let apiOrder = null;
  try {
    const params = new URLSearchParams({ _t: String(Date.now()), company_id: String(cid) });
    const { res, json } = await fetchJson(
      buildApiUrl(`api/transactions/user_currency_order_api.php?${params.toString()}`),
      { signal },
    );
    if (res.ok && json?.success && Array.isArray(json?.data?.order)) {
      apiOrder = json.data.order;
    }
  } catch (e) {
    if (e?.name === "AbortError") throw e;
  }

  const saved = resolveSavedCurrencyOrder(cid, apiOrder);
  return mergeCurrencyCodesWithSavedOrder(codes, saved);
}

/**
 * Desktop parity: persist the user's currency pill order (per company, or per
 * group when no company is selected).
 */
export async function saveUserCurrencyOrder(order, { companyId, groupId } = {}) {
  const codes = Array.isArray(order)
    ? order.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const body = { order: codes };
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) {
    body.company_id = cid;
  } else {
    const gid = groupId != null ? String(groupId).trim().toUpperCase() : "";
    if (gid) body.group_id = gid;
  }
  const { json } = await fetchJson(buildApiUrl("api/transactions/user_currency_order_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return json;
}

export function persistCurrencyDisplayOrder(companyId, order) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0 || !Array.isArray(order)) return;
  try {
    localStorage.setItem(
      `${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${cid}`,
      JSON.stringify(order.map((c) => String(c).trim().toUpperCase())),
    );
  } catch {
    /* private mode */
  }
}

export function persistUserCurrencyDisplayOrder(order) {
  if (!Array.isArray(order)) return;
  try {
    localStorage.setItem(
      USER_CURRENCY_DISPLAY_ORDER_LS_KEY,
      JSON.stringify(order.map((c) => String(c).trim().toUpperCase())),
    );
  } catch {
    /* private mode */
  }
}
