import { buildApiUrl } from "../utils/apiUrl.js";
import { DASHBOARD_BOOTSTRAP_API } from "./dashboardConstants.js";
import {
  attachGroupAggregateEarningsFields,
  finalizeMergedGroupLedgerDashboard,
  mergeGroupData,
} from "./dashboardMerge.js";
import {
  companiesInGroup,
  normalizeGroupId,
  pickCompany,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "./dashboardScope.js";
import { shouldAggregateChartByMonth } from "./dashboardDateUtils.js";
import { canAccessGroupLedgerForGroup } from "./loginScope.js";
import { assertApiOk, fetchJson } from "./fetchJson.js";

const MERGE_POOL = 5;
const CURRENCY_FANOUT_POOL = 3;

function isHistoricalOwnershipMonth(dateTo) {
  const m = String(dateTo || "").trim().match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  const key = `${m[1]}-${m[2]}`;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return key < current;
}

function isGroupEntityRow(row, viewGroup) {
  const vg = normalizeGroupId(viewGroup);
  if (!row || !vg) return false;
  const code = String(row.company_id || "").trim().toUpperCase();
  return code === vg;
}

function applyLinkMultiplier(data, companyRow, viewGroup, dateTo) {
  if (!data || !viewGroup || !companyRow) return data;
  const pct =
    companyRow.link_percentage !== undefined && companyRow.link_percentage !== null
      ? parseFloat(companyRow.link_percentage)
      : NaN;
  const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
  const apiHasGroupEquity = parseFloat(data?.group_equity_percentage) > 0;
  if (linkMultiplier !== 1 && !isHistoricalOwnershipMonth(dateTo) && !apiHasGroupEquity) {
    return { ...data, _link_multiplier: linkMultiplier };
  }
  return data;
}

/**
 * Subsidiaries for Company All under one group (desktop allowC168=false for single group).
 * Groups All union uses allowC168=true so C168 under AP is included.
 * If a group only has C168, include it so Company All does not fail empty.
 */
function resolveGroupAllCompanyList(companies, selectedGroup, { allowC168 = false } = {}) {
  const g = normalizeGroupId(selectedGroup);
  if (!g) return [];
  const inGroup = companiesInGroup(companies, g).filter((c) => {
    const code = String(c.company_id || "").trim().toUpperCase();
    return !!code && !isGroupEntityRow(c, g);
  });
  const withoutC168 = inGroup.filter((c) => String(c.company_id || "").trim().toUpperCase() !== "C168");
  if (allowC168) return inGroup;
  return withoutC168.length ? withoutC168 : inGroup;
}

function resolveGroupsAllCompanyList(companies) {
  const gids = sortedUniqueGroupIds(companies);
  const seen = new Set();
  const out = [];
  for (const g of gids) {
    for (const row of resolveGroupAllCompanyList(companies, g, { allowC168: true })) {
      const id = Number(row.id);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const pool = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}

function buildSingleCompanyBootstrapQuery({
  dateFrom,
  dateTo,
  currency,
  currencies,
  companyId,
  viewGroup,
  bootstrapScope = "full",
}) {
  const q = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    bootstrap_scope: bootstrapScope,
    company_id: String(companyId),
  });
  if (currency) q.set("currency", currency);
  if (Array.isArray(currencies) && currencies.length > 1) {
    q.set("currencies", currencies.join(","));
  }
  if (bootstrapScope === "full" && shouldAggregateChartByMonth(dateFrom, dateTo)) {
    q.set("chart_monthly", "1");
  }
  const vg = normalizeGroupId(viewGroup);
  if (vg) {
    q.set("view_group", vg);
    q.set("group_id", vg);
    q.set("subsidiary_accounts_only", "1");
  }
  return q;
}

function buildGroupLedgerBootstrapQuery({ dateFrom, dateTo, currency, groupKey }) {
  const g = normalizeGroupId(groupKey);
  const q = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    bootstrap_scope: "full",
    view_group: g,
    group_id: g,
    group_only: "1",
  });
  if (currency) q.set("currency", currency);
  if (shouldAggregateChartByMonth(dateFrom, dateTo)) {
    q.set("chart_monthly", "1");
  }
  return q;
}

async function fetchBootstrapData(query, signal, loadError) {
  const { res, json } = await fetchJson(
    buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${query}`),
    { signal },
  );
  assertApiOk(res, json, loadError);
  if (!json?.data) throw new Error(loadError);
  const data = json.data;

  // Desktop parity: when the bootstrap trims the previous period, refetch it
  // with bootstrap_scope=previous so MoM compare KPIs never silently vanish.
  if (query.get("bootstrap_scope") === "full" && !data.previous) {
    try {
      const prevQuery = new URLSearchParams(query);
      prevQuery.set("bootstrap_scope", "previous");
      const prev = await fetchBootstrapData(prevQuery, signal, loadError);
      if (prev?.previous) {
        data.previous = prev.previous;
        data.previous_date_range = data.previous_date_range || prev.previous_date_range || null;
      }
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      /* compare KPIs simply stay absent */
    }
  }
  return data;
}

/** Best-effort group ledger enrich; silent if user lacks group-ledger permission. */
async function enrichWithGroupLedger(merged, previous, { dateFrom, dateTo, currency, groupKey, signal }) {
  const g = normalizeGroupId(groupKey);
  if (!merged || !g) return { current: merged, previous, previous_date_range: null, _ledger: false };
  try {
    const q = buildGroupLedgerBootstrapQuery({ dateFrom, dateTo, currency, groupKey: g });
    const ledger = await fetchBootstrapData(q, signal, "ledger");
    return {
      current: attachGroupAggregateEarningsFields(merged, ledger.current),
      previous: previous
        ? attachGroupAggregateEarningsFields(previous, ledger.previous || ledger.current)
        : null,
      previous_date_range: ledger.previous_date_range || null,
      _ledger: true,
    };
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return { current: merged, previous, previous_date_range: null, _ledger: false };
  }
}

function resolveMergeViewGroup(companyRow, selectedGroup, groupsAllMode) {
  return groupsAllMode
    ? resolveViewGroupForCompany(companyRow, selectedGroup)
    : normalizeGroupId(selectedGroup) || resolveViewGroupForCompany(companyRow, null);
}

/** Merge one currency across all companies in the All scope (kpi-scoped for non-primary). */
async function mergeCompaniesForCurrency({
  list,
  currencyCode,
  dateFrom,
  dateTo,
  selectedGroup,
  groupsAllMode,
  bootstrapScope,
  signal,
  loadError,
}) {
  const code = String(currencyCode || "").toUpperCase();
  const settled = await mapPool(list, MERGE_POOL, async (companyRow) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const viewGroup = resolveMergeViewGroup(companyRow, selectedGroup, groupsAllMode);
    const q = buildSingleCompanyBootstrapQuery({
      dateFrom,
      dateTo,
      currency: code,
      currencies: [code],
      companyId: companyRow.id,
      viewGroup,
      bootstrapScope,
    });
    try {
      const data = await fetchBootstrapData(q, signal, loadError);
      const payload = data.current || null;
      if (!payload) return null;
      return applyLinkMultiplier(payload, companyRow, viewGroup, dateTo);
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      return null;
    }
  });
  const payloads = settled.filter(Boolean);
  if (!payloads.length) return null;
  return mergeGroupData(payloads, { startDate: dateFrom, endDate: dateTo });
}

/**
 * Build bootstrap.earnings.current like desktop group-All multi-currency merge.
 * Primary currency reuses the already-merged KPI payload; others fan-out with kpi scope.
 */
async function buildMergedEarningsByCurrency({
  list,
  currencies,
  primaryCurrency,
  primaryMerged,
  dateFrom,
  dateTo,
  selectedGroup,
  groupsAllMode,
  signal,
  loadError,
}) {
  const primary = String(primaryCurrency || "MYR").toUpperCase();
  const codes = [
    ...new Set(
      [primary, ...(currencies || [])]
        .map((c) => String(c || "").trim().toUpperCase())
        .filter((c) => /^[A-Z]{3}$/.test(c)),
    ),
  ];
  if (!codes.length) {
    return primaryMerged ? { current: [{ code: primary, payload: primaryMerged }], previous: [] } : null;
  }

  const entries = await mapPool(codes, CURRENCY_FANOUT_POOL, async (code) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (code === primary && primaryMerged) {
      return { code, payload: primaryMerged };
    }
    const merged = await mergeCompaniesForCurrency({
      list,
      currencyCode: code,
      dateFrom,
      dateTo,
      selectedGroup,
      groupsAllMode,
      bootstrapScope: "kpi",
      signal,
      loadError,
    });
    return { code, payload: merged };
  });

  return {
    current: entries.filter((e) => e?.code),
    previous: [],
  };
}

/**
 * Load dashboard like desktop:
 * - group-only (Group pill, no company) → group_only bootstrap
 * - single company → one bootstrap (with subsidiary scope when in a group)
 * - Company All (single group) → parallel per-company bootstrap + merge + ledger enrich
 * - Groups All (no company) → per-group ledger bootstrap merge (desktop parity)
 * - All modes → fan-out per-currency merge into earnings.current (hero / pie parity)
 */
export async function loadMobileDashboardData(scopeState, { signal, loadError } = {}) {
  const {
    dateFrom,
    dateTo,
    currency,
    currencies,
    companyId,
    selectedGroup,
    groupAllMode,
    groupsAllMode,
    companies,
    me,
  } = scopeState;

  const group = normalizeGroupId(selectedGroup);
  const cidNum = Number(companyId);
  const hasCompany = Number.isFinite(cidNum) && cidNum > 0;
  const groupOnlyMode = Boolean(group && !groupAllMode && !groupsAllMode && !hasCompany);

  // Groups All (desktop): merge each accessible group's ledger books — not subsidiary fan-out.
  if (groupsAllMode && !groupAllMode && !hasCompany) {
    const gids = sortedUniqueGroupIds(companies).filter((gid) =>
      canAccessGroupLedgerForGroup(me, gid, companies),
    );
    if (!gids.length) throw new Error(loadError || "Failed to load dashboard");

    const primaryCode = String(currency || (currencies && currencies[0]) || "MYR").toUpperCase();
    const settled = await mapPool(gids, MERGE_POOL, async (gid) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const q = buildGroupLedgerBootstrapQuery({
          dateFrom,
          dateTo,
          currency: primaryCode,
          groupKey: gid,
        });
        const data = await fetchBootstrapData(q, signal, loadError);
        const markLedger = (payload) =>
          payload
            ? {
                ...payload,
                has_ownership_setup: !!payload.has_group_ownership || !!payload.has_ownership_setup,
                _group_aggregate_earnings: true,
              }
            : payload;
        return {
          current: markLedger(data.current),
          previous: markLedger(data.previous),
          previous_date_range: data.previous_date_range || null,
        };
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        return null;
      }
    });

    const pairs = settled.filter(Boolean);
    if (!pairs.length) throw new Error(loadError || "Failed to load dashboard");

    const currentList = pairs.map((p) => p.current).filter(Boolean);
    const previousList = pairs.map((p) => p.previous).filter(Boolean);
    let current = finalizeMergedGroupLedgerDashboard(
      mergeGroupData(currentList, { startDate: dateFrom, endDate: dateTo }),
      currentList,
    );
    let previous = previousList.length
      ? finalizeMergedGroupLedgerDashboard(
          mergeGroupData(previousList, { startDate: dateFrom, endDate: dateTo }),
          previousList,
        )
      : null;
    const previous_date_range = pairs.find((p) => p.previous_date_range)?.previous_date_range || null;

    let earnings = null;
    const codes = [
      ...new Set(
        [primaryCode, ...(currencies || [])]
          .map((c) => String(c || "").trim().toUpperCase())
          .filter((c) => /^[A-Z]{3}$/.test(c)),
      ),
    ];
    if (codes.length > 1) {
      const entries = await mapPool(codes, CURRENCY_FANOUT_POOL, async (code) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (code === primaryCode) return { code, payload: current };
        try {
          const perGroup = await mapPool(gids, MERGE_POOL, async (gid) => {
            const q = buildGroupLedgerBootstrapQuery({
              dateFrom,
              dateTo,
              currency: code,
              groupKey: gid,
            });
            q.set("bootstrap_scope", "kpi");
            const data = await fetchBootstrapData(q, signal, loadError);
            return data.current
              ? { ...data.current, _group_aggregate_earnings: true }
              : null;
          });
          const list = perGroup.filter(Boolean);
          if (!list.length) return { code, payload: null };
          return {
            code,
            payload: finalizeMergedGroupLedgerDashboard(
              mergeGroupData(list, { startDate: dateFrom, endDate: dateTo }),
              list,
            ),
          };
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          return { code, payload: null };
        }
      });
      earnings = { current: entries.filter((e) => e?.code), previous: [] };
    } else {
      earnings = { current: [{ code: primaryCode, payload: current }], previous: [] };
    }

    return {
      current,
      previous,
      previous_date_range,
      earnings,
      _mobile_scope: { mode: "groupsAllLedger", count: pairs.length, groups: gids },
    };
  }

  if (groupOnlyMode) {
    const primaryCode = String(currency || (currencies && currencies[0]) || "MYR").toUpperCase();
    const q = buildGroupLedgerBootstrapQuery({
      dateFrom,
      dateTo,
      currency: primaryCode,
      groupKey: group,
    });
    const data = await fetchBootstrapData(q, signal, loadError);
    const markLedger = (payload) =>
      payload
        ? {
            ...payload,
            has_ownership_setup: !!payload.has_group_ownership || !!payload.has_ownership_setup,
          }
        : payload;

    let earnings = null;
    const codes = [
      ...new Set(
        [primaryCode, ...(currencies || [])]
          .map((c) => String(c || "").trim().toUpperCase())
          .filter((c) => /^[A-Z]{3}$/.test(c)),
      ),
    ];
    if (codes.length > 1) {
      const entries = await mapPool(codes, CURRENCY_FANOUT_POOL, async (code) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (code === primaryCode) {
          return { code, payload: markLedger(data.current) };
        }
        try {
          const cq = buildGroupLedgerBootstrapQuery({
            dateFrom,
            dateTo,
            currency: code,
            groupKey: group,
          });
          cq.set("bootstrap_scope", "kpi");
          const cur = await fetchBootstrapData(cq, signal, loadError);
          return { code, payload: markLedger(cur.current) };
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          return { code, payload: null };
        }
      });
      earnings = { current: entries.filter((e) => e?.code), previous: [] };
    } else {
      earnings = {
        current: [{ code: primaryCode, payload: markLedger(data.current) }],
        previous: [],
      };
    }

    return {
      current: markLedger(data.current),
      previous: markLedger(data.previous),
      previous_date_range: data.previous_date_range || null,
      earnings,
      _mobile_scope: { mode: "groupOnly", group },
    };
  }

  const needsMerge = Boolean(groupAllMode || groupsAllMode);
  if (!needsMerge) {
    const row =
      (companies || []).find((c) => Number(c.id) === Number(companyId)) ||
      pickCompany(companies, companyId);
    const cid = Number(row?.id || companyId);
    if (!Number.isFinite(cid) || cid <= 0) throw new Error(loadError || "Failed to load dashboard");

    let viewGroup = normalizeGroupId(selectedGroup);
    if (!viewGroup) {
      viewGroup = resolveViewGroupForCompany(row, null);
    }
    const scopedViewGroup = viewGroup && !isGroupEntityRow(row, viewGroup) ? viewGroup : null;
    const primaryCode = String(currency || (currencies && currencies[0]) || "MYR").toUpperCase();
    // Desktop parity: primary KPI/chart bootstrap is single-currency only.
    // Secondary pie currencies fan out with bootstrap_scope=kpi (not serial currencies=).
    const q = buildSingleCompanyBootstrapQuery({
      dateFrom,
      dateTo,
      currency: primaryCode,
      currencies: [primaryCode],
      companyId: cid,
      viewGroup: scopedViewGroup,
      bootstrapScope: "full",
    });
    const data = await fetchBootstrapData(q, signal, loadError);
    const current = applyLinkMultiplier(data.current, row, viewGroup, dateTo);
    const previous = applyLinkMultiplier(data.previous, row, viewGroup, dateTo);

    const codes = [
      ...new Set(
        [primaryCode, ...(currencies || [])]
          .map((c) => String(c || "").trim().toUpperCase())
          .filter((c) => /^[A-Z]{3}$/.test(c)),
      ),
    ];
    let earnings = { current: [{ code: primaryCode, payload: current }], previous: [] };
    if (codes.length > 1) {
      const entries = await mapPool(codes, CURRENCY_FANOUT_POOL, async (code) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (code === primaryCode) return { code, payload: current };
        try {
          const cq = buildSingleCompanyBootstrapQuery({
            dateFrom,
            dateTo,
            currency: code,
            currencies: [code],
            companyId: cid,
            viewGroup: scopedViewGroup,
            bootstrapScope: "kpi",
          });
          const cur = await fetchBootstrapData(cq, signal, loadError);
          return {
            code,
            payload: applyLinkMultiplier(cur.current, row, viewGroup, dateTo),
          };
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          return { code, payload: null };
        }
      });
      earnings = { current: entries.filter((e) => e?.code), previous: [] };
    }

    return {
      ...data,
      current,
      previous,
      earnings,
      _mobile_scope: {
        mode: "single",
        companyId: cid,
        viewGroup,
        currencies: (earnings?.current || []).map((e) => e.code),
      },
    };
  }

  const list = groupsAllMode
    ? resolveGroupsAllCompanyList(companies)
    : resolveGroupAllCompanyList(companies, selectedGroup);

  if (!list.length) throw new Error(loadError || "Failed to load dashboard");

  const primaryCode = String(currency || (currencies && currencies[0]) || "MYR").toUpperCase();

  const settled = await mapPool(list, MERGE_POOL, async (companyRow) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const viewGroup = resolveMergeViewGroup(companyRow, selectedGroup, groupsAllMode);
    const q = buildSingleCompanyBootstrapQuery({
      dateFrom,
      dateTo,
      currency: primaryCode,
      currencies: [primaryCode],
      companyId: companyRow.id,
      viewGroup,
      bootstrapScope: "full",
    });
    try {
      const data = await fetchBootstrapData(q, signal, loadError);
      return {
        company: companyRow,
        viewGroup,
        current: applyLinkMultiplier(data.current, companyRow, viewGroup, dateTo),
        previous: applyLinkMultiplier(data.previous, companyRow, viewGroup, dateTo),
        previous_date_range: data.previous_date_range || null,
      };
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      return null;
    }
  });

  const pairs = settled.filter(Boolean);
  if (!pairs.length) throw new Error(loadError || "Failed to load dashboard");

  let current = mergeGroupData(
    pairs.map((p) => p.current).filter(Boolean),
    { startDate: dateFrom, endDate: dateTo },
  );
  let previous = (() => {
    const previousList = pairs.map((p) => p.previous).filter(Boolean);
    return previousList.length
      ? mergeGroupData(previousList, { startDate: dateFrom, endDate: dateTo })
      : null;
  })();
  let previous_date_range = pairs.find((p) => p.previous_date_range)?.previous_date_range || null;
  let ledgerApplied = false;

  if (groupAllMode && !groupsAllMode && selectedGroup) {
    const enriched = await enrichWithGroupLedger(current, previous, {
      dateFrom,
      dateTo,
      currency: primaryCode,
      groupKey: selectedGroup,
      signal,
    });
    current = enriched.current;
    previous = enriched.previous;
    if (enriched.previous_date_range) previous_date_range = enriched.previous_date_range;
    ledgerApplied = !!enriched._ledger;
  }

  let earnings = null;
  try {
    earnings = await buildMergedEarningsByCurrency({
      list,
      currencies,
      primaryCurrency: primaryCode,
      primaryMerged: current,
      dateFrom,
      dateTo,
      selectedGroup,
      groupsAllMode,
      signal,
      loadError,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    earnings = { current: [{ code: primaryCode, payload: current }], previous: [] };
  }

  return {
    current,
    previous,
    previous_date_range,
    earnings,
    _mobile_scope: {
      mode: groupsAllMode ? "groupsAll" : "groupAll",
      count: pairs.length,
      group: normalizeGroupId(selectedGroup),
      ledger: ledgerApplied,
      currencies: (earnings?.current || []).map((e) => e.code),
    },
  };
}

export function resolveMobileKpiOwnershipOpts({
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  companies,
}) {
  const group = normalizeGroupId(selectedGroup);
  const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;

  if (groupsAllMode && groupAllMode) {
    return { groupsAllCompaniesAggregate: true };
  }
  if (groupAllMode && selectedGroup) {
    return { groupAggregateEarnings: true, groupAllCompaniesEarningsSum: true };
  }
  // Groups All (no company): desktop uses group-ledger aggregate — not subsidiary earnings sum
  if (groupsAllMode && !groupAllMode) {
    return { groupAggregateEarnings: true };
  }
  // Group pill only (no company): group ledger books — use ownership when API returns it
  if (group && !groupAllMode && !groupsAllMode && !hasCompany) {
    return {};
  }
  if (!groupAllMode && !groupsAllMode && group && hasCompany) {
    const row = (companies || []).find((c) => Number(c.id) === Number(companyId));
    if (row && !isGroupEntityRow(row, group)) {
      return { subsidiaryGroupDrillDown: true };
    }
  }
  return {};
}
