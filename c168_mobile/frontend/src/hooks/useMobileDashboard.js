import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";
import { buildChartRows, resolveDailyChartXAxisTicks } from "../lib/dashboardChart.js";
import { shouldAggregateChartByMonth } from "../lib/dashboardDateUtils.js";
import { DASHBOARD_PROFIT_COLOR } from "../lib/dashboardConstants.js";
import {
  defaultDashboardDateRange,
  formatRangeLabel,
  periodPresetRange,
} from "../lib/dashboardDateUtils.js";
import { normalizeSubsidiaryEarningsByCompany } from "../lib/dashboardCompanyProfit.js";
import { buildKpiCompare, computeKpiMetrics } from "../lib/dashboardKpi.js";
import {
  companiesForPicker as resolveCompaniesForPicker,
  pickCompany,
  pickGroupAnchorCompany,
  resolveCompanyPickForGroup,
  resolveInitialMobileGcScope,
  resolveMobileGroupIds,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "../lib/dashboardScope.js";
import {
  canUseGroupOnlyMode,
  companyLoginCanUseGroupsAllLedger,
  filterCompaniesForUserScope,
  isCompanyLogin,
  isGroupLogin,
} from "../lib/loginScope.js";
import {
  buildMobileRealtimeScopeFromGc,
  setMobileRealtimeScope,
} from "../lib/realtime/mobileRealtimeScope.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { fetchMobileCurrencyCodes } from "../lib/dashboardCurrencies.js";
import { mapPanelCurrencyRows } from "../lib/dashboardEarnings.js";
import { loadMobileDashboardData, resolveMobileKpiOwnershipOpts } from "../lib/dashboardLoad.js";
import {
  computeDisplayConvertedAmount,
  fetchFrankfurterRates,
  frankfurterRatesPartiallyUsable,
  resolveFrankfurterDate,
  sumConvertedEarnings,
} from "../lib/frankfurterRates.js";
import { dashboardDataIsUsable } from "../lib/demoDashboard.js";
import { assertApiOk, fetchJson } from "../lib/fetchJson.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import { canAccessDashboard, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const COMPANIES_API = "api/transactions/get_owner_companies_api.php";

/* Desktop parity (TransactionDashboardPage sticky package): freeze the full filter
   package in sessionStorage so a refresh repaints Date+Group+Company+Currency as-is. */
const MOBILE_DASHBOARD_FILTERS_KEY = "m-dashboard-filter-paint";

function readSavedDashboardFilters() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MOBILE_DASHBOARD_FILTERS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}

function writeSavedDashboardFilters(pkg) {
  if (typeof sessionStorage === "undefined" || !pkg) return;
  try {
    sessionStorage.setItem(MOBILE_DASHBOARD_FILTERS_KEY, JSON.stringify(pkg));
  } catch {
    /* quota */
  }
}

function sameStringList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function buildDashboardScopeKey({
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  dateFrom,
  dateTo,
  currency,
}) {
  const cid = Number.isFinite(Number(companyId)) && Number(companyId) > 0 ? String(Number(companyId)) : "";
  return [
    cid,
    String(selectedGroup || "").toUpperCase(),
    groupAllMode ? "1" : "0",
    groupsAllMode ? "1" : "0",
    dateFrom || "",
    dateTo || "",
    String(currency || "").toUpperCase(),
  ].join("|");
}

/** Group/Company/All modes only — used to force currency reset on scope switch. */
function buildGcScopeIdentity({ companyId, selectedGroup, groupAllMode, groupsAllMode }) {
  const cid = Number.isFinite(Number(companyId)) && Number(companyId) > 0 ? String(Number(companyId)) : "";
  return [
    cid,
    String(selectedGroup || "").toUpperCase(),
    groupAllMode ? "1" : "0",
    groupsAllMode ? "1" : "0",
  ].join("|");
}

function earningsRowsFromBootstrap(
  bootstrap,
  { panelNetProfit = null, panelEarnings = null, primaryCurrency, kpiOpts = {} } = {},
) {
  // Dual metrics for Currency / Earning tabs (desktop parity).
  // Pin primary currency to painted KPI so pie/list never disagree with hero cards.
  const primary = String(primaryCurrency || "").toUpperCase();
  const entries = bootstrap?.earnings?.current;
  if (Array.isArray(entries) && entries.length) {
    return entries
      .map(({ code, payload }) => {
        if (!payload) return null;
        const metrics = computeKpiMetrics(payload, kpiOpts);
        const normalized = String(code || "").trim().toUpperCase();
        const isPrimary = normalized === primary;
        const netProfit =
          isPrimary && panelNetProfit != null
            ? panelNetProfit
            : (metrics?.netProfit ?? null);
        const earnings =
          isPrimary && panelEarnings != null
            ? panelEarnings
            : (metrics?.earnings ?? metrics?.netProfit ?? null);
        return { code: normalized, netProfit, earnings };
      })
      .filter((row) => row?.code);
  }

  const current = bootstrap?.current;
  const metrics = computeKpiMetrics(current, kpiOpts);
  const code = String(current?.currency || current?.settlement_currency || primaryCurrency || "MYR").toUpperCase();
  const netProfit = panelNetProfit ?? metrics?.netProfit ?? null;
  const earnings = panelEarnings ?? metrics?.earnings ?? metrics?.netProfit ?? null;
  if (netProfit == null && earnings == null) return [];
  return [{ code, netProfit, earnings }];
}

export function useMobileDashboard() {
  const navigate = useNavigate();
  const defaults = defaultDashboardDateRange();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const savedFiltersRef = useRef(readSavedDashboardFilters());
  const savedFilters = savedFiltersRef.current;
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [currency, setCurrency] = useState(
    String(savedFilters?.currency || "MYR").toUpperCase(),
  );
  const [currencies, setCurrencies] = useState(["MYR"]);
  const [currenciesReady, setCurrenciesReady] = useState(false);
  const [dateFrom, setDateFrom] = useState(savedFilters?.dateFrom || defaults.dateFrom);
  const [dateTo, setDateTo] = useState(savedFilters?.dateTo || defaults.dateTo);
  const [activePreset, setActivePreset] = useState(savedFilters?.activePreset ?? "thisMonth");
  const [earningsPanelView, setEarningsPanelView] = useState("currency");
  const [bootstrap, setBootstrap] = useState(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState("");
  const loadedScopeKeyRef = useRef("");
  const [exchangeRates, setExchangeRates] = useState({ rates: { MYR: 1 }, date: null });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState(false);
  const [chartVisible, setChartVisible] = useState({ 0: false, 1: false, 2: true, 3: false });
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [accessModal, setAccessModal] = useState({ open: false, message: "" });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [sessionNonce, setSessionNonce] = useState(0);
  const bootstrapSeq = useRef(0);
  const scopeSeq = useRef(0);
  const scopeAbortRef = useRef(null);
  /** Small in-memory bootstrap cache for snappier back-navigation (cap ~32). */
  const bootstrapCacheRef = useRef(new Map());
  /** Desktop parity: after Group/Company switch, force first currency of new scope. */
  const preferFirstCurrencyRef = useRef(false);
  const gcScopeIdentityRef = useRef("");

  const groupIds = useMemo(() => resolveMobileGroupIds(companies, me), [companies, me]);

  const companiesForPicker = useMemo(
    () =>
      resolveCompaniesForPicker(companies, {
        selectedGroup,
        groupsAllMode,
        preferredCompanyId: companyId,
      }),
    [companies, selectedGroup, groupsAllMode, companyId],
  );

  const selectedCompany = useMemo(
    () => companies.find((c) => Number(c.id) === Number(companyId)) || null,
    [companies, companyId],
  );

  const loadBootstrap = useCallback(
    async (scopeState, signal) => {
      return loadMobileDashboardData(scopeState, { signal, loadError: i18n.loadError });
    },
    [i18n.loadError],
  );

  // Session + companies (once)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { res: meRes, json: meJson } = await fetchJson(
          buildApiUrl("api/session/current_user_api.php"),
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        if (!meRes.ok || !meJson?.success || !meJson?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = meJson.data;
        if (user.needs_owner_secondary || user.needs_user_secondary) {
          navigate(user.needs_owner_secondary ? "/owner-secondary-password" : "/user-secondary-password", {
            replace: true,
          });
          return;
        }
        if (String(user.user_type || "").toLowerCase() === "member") {
          navigate("/member", { replace: true });
          return;
        }
        if (!canAccessDashboard(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);

        const { res: coRes, json: coJson } = await fetchJson(
          buildApiUrl(`${COMPANIES_API}?all=1`),
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        assertApiOk(coRes, coJson, i18n.loadError);
        const list = Array.isArray(coJson?.data) ? coJson.data : [];
        const scoped = filterCompaniesForUserScope(list, user);
        const picked = pickCompany(scoped, user.company_id);
        if (!picked) throw new Error(i18n.loadError);

        const initial = resolveInitialMobileGcScope(user, scoped, picked);
        setCompanies(scoped);
        setCompanyId(initial.companyId);
        setSelectedGroup(initial.selectedGroup);
        setGroupsAllMode(initial.groupsAllMode);
        setGroupAllMode(initial.groupAllMode);

        /* Desktop parity: repaint the saved filter package after a refresh —
           scope parts are validated against this login's company/group list. */
        const saved = savedFiltersRef.current;
        const ownerKey = String(user.user_id ?? user.id ?? "");
        if (saved && saved.ownerKey && saved.ownerKey === ownerKey) {
          const savedCompany =
            saved.companyId != null
              ? scoped.find((c) => Number(c.id) === Number(saved.companyId))
              : null;
          if (savedCompany) {
            setCompanyId(Number(savedCompany.id));
            setSelectedGroup(saved.selectedGroup ?? null);
            setGroupsAllMode(Boolean(saved.groupsAllMode));
            setGroupAllMode(Boolean(saved.groupAllMode));
          } else if (
            !initial.companyId &&
            saved.selectedGroup &&
            resolveMobileGroupIds(scoped, user).includes(saved.selectedGroup)
          ) {
            setCompanyId(null);
            setSelectedGroup(saved.selectedGroup);
            setGroupsAllMode(Boolean(saved.groupsAllMode));
            setGroupAllMode(Boolean(saved.groupAllMode));
          }
        } else if (saved && saved.ownerKey && ownerKey && saved.ownerKey !== ownerKey) {
          savedFiltersRef.current = null;
        }
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(e?.message || i18n.loadError);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate, i18n.loadError, sessionNonce]);

  useEffect(() => {
    bootstrapCacheRef.current.clear();
  }, [sessionNonce]);

  // Currencies before bootstrap — avoids first paint locked to MYR-only
  useEffect(() => {
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const groupOnly = Boolean(selectedGroup && !groupAllMode && !groupsAllMode && !hasCompany);
    if (!companies.length || (!hasCompany && !groupOnly && !groupsAllMode && !groupAllMode)) {
      return undefined;
    }
    const nextIdentity = buildGcScopeIdentity({
      companyId,
      selectedGroup,
      groupAllMode,
      groupsAllMode,
    });
    if (gcScopeIdentityRef.current && gcScopeIdentityRef.current !== nextIdentity) {
      preferFirstCurrencyRef.current = true;
    }
    gcScopeIdentityRef.current = nextIdentity;

    const ac = new AbortController();
    // Soft refresh: don't flip currenciesReady false if we already have data (avoids full-page spinner flash).
    setCurrenciesReady((ready) => (ready ? ready : false));
    (async () => {
      try {
        const codes = await fetchMobileCurrencyCodes({
          companyId,
          selectedGroup,
          groupAllMode,
          groupsAllMode,
          companies,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        const next = codes.length ? codes : ["MYR"];
        setCurrencies((prev) => (sameStringList(prev, next) ? prev : next));
        setCurrency((prev) => {
          if (preferFirstCurrencyRef.current) {
            preferFirstCurrencyRef.current = false;
            return next[0] || "MYR";
          }
          return next.includes(prev) ? prev : next[0] || "MYR";
        });
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setCurrencies((prev) => (prev.length ? prev : ["MYR"]));
      } finally {
        if (!ac.signal.aborted) setCurrenciesReady(true);
      }
    })();
    return () => ac.abort();
  }, [companies, companyId, selectedGroup, groupAllMode, groupsAllMode]);

  // Bootstrap — gated on currenciesReady; ignore stale responses
  const scopeKey = useMemo(
    () =>
      buildDashboardScopeKey({
        companyId,
        selectedGroup,
        groupAllMode,
        groupsAllMode,
        dateFrom,
        dateTo,
        currency,
      }),
    [companyId, selectedGroup, groupAllMode, groupsAllMode, dateFrom, dateTo, currency],
  );

  /* Desktop parity: persist the filter package so a refresh restores it. */
  useEffect(() => {
    if (!me || !companies.length) return;
    writeSavedDashboardFilters({
      ownerKey: String(me.user_id ?? me.id ?? ""),
      companyId: companyId ?? null,
      selectedGroup: selectedGroup ?? null,
      groupsAllMode,
      groupAllMode,
      currency,
      activePreset,
      dateFrom,
      dateTo,
    });
  }, [
    me,
    companies.length,
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    currency,
    activePreset,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const groupOnly = Boolean(selectedGroup && !groupAllMode && !groupsAllMode && !hasCompany);
    const canLoad =
      companies.length &&
      currenciesReady &&
      (hasCompany || groupOnly || groupsAllMode || groupAllMode);
    if (!canLoad) return undefined;
    const ac = new AbortController();
    const seq = ++bootstrapSeq.current;
    const requestScopeKey = scopeKey;
    const prevLoaded = loadedScopeKeyRef.current;
    const isScopeChange = Boolean(prevLoaded) && prevLoaded !== requestScopeKey;
    const cached = bootstrapCacheRef.current.get(requestScopeKey);
    if (cached) {
      // Paint cached bootstrap immediately, then refresh in background.
      loadedScopeKeyRef.current = requestScopeKey;
      setLoadedScopeKey(requestScopeKey);
      setBootstrap(cached);
    }
    setBootstrapping(true);
    setError("");
    (async () => {
      try {
        const data = await loadBootstrap(
          {
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
          },
          ac.signal,
        );
        if (ac.signal.aborted || seq !== bootstrapSeq.current) return;
        let finalData = data;
        if (import.meta.env.DEV && !dashboardDataIsUsable(data)) {
          const { DEMO_BOOTSTRAP } = await import("../lib/demoDashboard.js");
          finalData = DEMO_BOOTSTRAP;
        }
        const cache = bootstrapCacheRef.current;
        cache.set(requestScopeKey, finalData);
        while (cache.size > 32) {
          const oldest = cache.keys().next().value;
          cache.delete(oldest);
        }
        loadedScopeKeyRef.current = requestScopeKey;
        setLoadedScopeKey(requestScopeKey);
        setBootstrap(finalData);
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError" || seq !== bootstrapSeq.current) return;
        setError(e?.message || i18n.loadError);
        // Soft refresh keeps last paint; scope change must not show another company's totals.
        if ((isScopeChange || !prevLoaded) && !cached) {
          loadedScopeKeyRef.current = "";
          setLoadedScopeKey("");
          setBootstrap(null);
        }
      } finally {
        if (!ac.signal.aborted && seq === bootstrapSeq.current) setBootstrapping(false);
      }
    })();
    return () => ac.abort();
  }, [
    companies,
    companyId,
    selectedGroup,
    groupAllMode,
    groupsAllMode,
    dateFrom,
    dateTo,
    currency,
    currencies,
    currenciesReady,
    reloadNonce,
    loadBootstrap,
    i18n.loadError,
    scopeKey,
    me,
  ]);

  const needsMultiCurrencyFx = currencies.length > 1;
  const useConvertedEarnings = useMemo(
    () =>
      needsMultiCurrencyFx &&
      frankfurterRatesPartiallyUsable(currency, currencies, exchangeRates?.rates || {}),
    [needsMultiCurrencyFx, currencies, currency, exchangeRates?.rates],
  );
  const scopeStale = Boolean(bootstrap) && loadedScopeKey && loadedScopeKey !== scopeKey;
  // Skeleton on cold start or when switching Group/Company (never paint wrong-scope totals).
  const initialLoading = loading || scopeStale || (!bootstrap && (bootstrapping || !currenciesReady));
  const refreshing = Boolean(bootstrap) && !scopeStale && (bootstrapping || exchangeRatesLoading);
  const showLoading = initialLoading;

  useEffect(() => {
    if (!needsMultiCurrencyFx || !currency) {
      setExchangeRates({ rates: { [currency]: 1 }, date: null });
      setExchangeRatesLoading(false);
      setExchangeRatesError(false);
      return undefined;
    }

    const ac = new AbortController();
    setExchangeRatesLoading(true);
    setExchangeRatesError(false);
    (async () => {
      try {
        const payload = await fetchFrankfurterRates(currency, currencies, {
          signal: ac.signal,
          date: resolveFrankfurterDate(dateTo),
        });
        if (!ac.signal.aborted) {
          setExchangeRates(payload);
          setExchangeRatesError(false);
        }
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        // Keep previous rates on failure to avoid undercounted totals flashing to identity.
        setExchangeRates((prev) =>
          prev?.rates && Object.keys(prev.rates).length
            ? prev
            : { rates: { [currency]: 1 }, date: null },
        );
        setExchangeRatesError(true);
      } finally {
        if (!ac.signal.aborted) setExchangeRatesLoading(false);
      }
    })();

    return () => ac.abort();
  }, [currency, currencies, needsMultiCurrencyFx, dateTo]);

  const kpiOwnershipOpts = useMemo(
    () =>
      resolveMobileKpiOwnershipOpts({
        companyId,
        selectedGroup,
        groupAllMode,
        groupsAllMode,
        companies,
      }),
    [companyId, selectedGroup, groupAllMode, groupsAllMode, companies],
  );

  const kpi = useMemo(() => {
    const current = bootstrap?.current;
    const previous = bootstrap?.previous;
    const metrics = computeKpiMetrics(current, kpiOwnershipOpts);
    if (!metrics) return null;
    const prevMetrics = computeKpiMetrics(previous, kpiOwnershipOpts);
    const canCompareEarnings = Boolean(metrics.showEarnings && prevMetrics?.showEarnings);
    return {
      ...metrics,
      comparisons: prevMetrics
        ? {
            profit: buildKpiCompare(metrics.profit, prevMetrics.profit),
            expenses: buildKpiCompare(metrics.expenses, prevMetrics.expenses),
            netProfit: buildKpiCompare(metrics.netProfit, prevMetrics.netProfit),
            earnings: canCompareEarnings
              ? buildKpiCompare(metrics.kpiCardEarnings, prevMetrics.kpiCardEarnings)
              : null,
          }
        : null,
    };
  }, [bootstrap, kpiOwnershipOpts]);

  // Backend always shifts range by −1 month; label from previous_date_range when present.
  const compareLabel = useMemo(() => {
    const prev = bootstrap?.previous_date_range;
    if (prev?.from && prev?.to) {
      return `${i18n.vsPreviousPeriod} (${formatRangeLabel(prev.from, prev.to, { withYear: false })})`;
    }
    const map = {
      today: i18n.vsPreviousPeriod,
      yesterday: i18n.vsPreviousPeriod,
      thisWeek: i18n.vsPreviousPeriod,
      lastWeek: i18n.vsLastWeek,
      thisMonth: i18n.vsLastMonth,
      lastMonth: i18n.vsPreviousPeriod,
      thisYear: i18n.vsPreviousPeriod,
      lastYear: i18n.vsLastYear,
    };
    return map[activePreset] || i18n.vsPreviousPeriod;
  }, [activePreset, bootstrap, i18n]);

  const chartRows = useMemo(
    () => buildChartRows(bootstrap?.current, dateFrom, dateTo, kpiOwnershipOpts),
    [bootstrap, dateFrom, dateTo, kpiOwnershipOpts],
  );

  const chartSeries = useMemo(() => {
    const series = [
      { idx: 0, label: i18n.profit, color: DASHBOARD_PROFIT_COLOR, dataKey: "profit", fill: "url(#mGProfit)" },
      { idx: 1, label: i18n.expenses, color: "#ef4444", dataKey: "expenses", fill: "url(#mGExp)" },
      { idx: 2, label: i18n.netProfitChart, color: "#10b981", dataKey: "netProfit", fill: "url(#mGNet)" },
    ];
    if (kpi?.showEarnings) {
      series.push({ idx: 3, label: i18n.earnings, color: "#f59e0b", dataKey: "earnings", fill: "url(#mGEarn)" });
    }
    return series;
  }, [i18n, kpi?.showEarnings]);

  const chartIsMonthly = useMemo(
    () => shouldAggregateChartByMonth(dateFrom, dateTo),
    [dateFrom, dateTo],
  );

  const chartXAxisLayout = useMemo(() => {
    return resolveDailyChartXAxisTicks(chartRows.length, { monthly: chartIsMonthly });
  }, [chartRows.length, chartIsMonthly]);

  const panelMetric = kpi?.netProfit ?? null;
  const panelEarningsMetric = kpi?.showEarnings ? (kpi?.earnings ?? null) : null;

  const earningsCurrencyRows = useMemo(() => {
    const rows = earningsRowsFromBootstrap(bootstrap, {
      panelNetProfit: panelMetric,
      panelEarnings: panelEarningsMetric,
      primaryCurrency: currency,
      kpiOpts: kpiOwnershipOpts,
    });
    if (!useConvertedEarnings) return rows;
    return rows.map((row) => {
      const isPrimary = String(row.code).toUpperCase() === String(currency).toUpperCase();
      return {
        ...row,
        netProfitConverted: isPrimary
          ? row.netProfit
          : computeDisplayConvertedAmount(row.netProfit, row.code, currency, exchangeRates.rates),
        earningsConverted: isPrimary
          ? row.earnings
          : computeDisplayConvertedAmount(row.earnings, row.code, currency, exchangeRates.rates),
      };
    });
  }, [
    bootstrap,
    panelMetric,
    panelEarningsMetric,
    currency,
    useConvertedEarnings,
    exchangeRates.rates,
    kpiOwnershipOpts,
  ]);

  const groupOnlyMode = Boolean(
    selectedGroup && !groupAllMode && !groupsAllMode && !(Number.isFinite(Number(companyId)) && Number(companyId) > 0),
  );

  const showEarningPanelTab = Boolean(kpi?.showEarnings);
  const showNetProfitForTab = useMemo(
    () =>
      Boolean(groupOnlyMode) &&
      normalizeSubsidiaryEarningsByCompany(bootstrap?.current?.subsidiary_earnings_by_company).length > 0,
    [groupOnlyMode, bootstrap],
  );
  const showSummaryPanelTabs = showEarningPanelTab || showNetProfitForTab;

  useEffect(() => {
    if (!showEarningPanelTab && earningsPanelView === "earning") {
      setEarningsPanelView("currency");
    }
    if (!showNetProfitForTab && earningsPanelView === "netProfitFor") {
      setEarningsPanelView("currency");
    }
  }, [showEarningPanelTab, showNetProfitForTab, earningsPanelView]);

  const panelCurrencyRows = useMemo(() => {
    if (earningsPanelView === "netProfitFor") {
      const companyRows = normalizeSubsidiaryEarningsByCompany(
        bootstrap?.current?.subsidiary_earnings_by_company,
      );
      return companyRows.map((row) => ({
        code: row.company_id,
        group: row.group_id,
        netProfit: row.net_profit,
        earnings: row.net_profit,
        netProfitConverted: null,
        earningsConverted: null,
      }));
    }
    return mapPanelCurrencyRows(earningsCurrencyRows, earningsPanelView, {
      useConverted: useConvertedEarnings,
    });
  }, [earningsCurrencyRows, earningsPanelView, useConvertedEarnings, bootstrap]);

  // Desktop parity: multi-currency panel/hero total = FX-converted sum into display currency.
  const convertedNetProfitTotal = useMemo(() => {
    if (!useConvertedEarnings) return null;
    const rows = earningsCurrencyRows.map((row) => ({
      code: row.code,
      earnings: row.netProfit,
    }));
    return sumConvertedEarnings(rows, currency, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRows, currency, exchangeRates.rates]);

  const convertedEarningsTotal = useMemo(() => {
    if (!useConvertedEarnings) return null;
    const rows = earningsCurrencyRows.map((row) => ({
      code: row.code,
      earnings: row.earnings,
    }));
    return sumConvertedEarnings(rows, currency, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRows, currency, exchangeRates.rates]);

  // Top blue hero stays single-currency; converted totals feed the pie panel only.
  const summaryValue = panelMetric ?? 0;

  const heroCompare = useMemo(() => kpi?.comparisons?.netProfit || null, [kpi?.comparisons?.netProfit]);

  const showMultiCurrencyNote = Boolean(
    useConvertedEarnings && convertedNetProfitTotal != null,
  );

  const ratesWarning = useMemo(() => {
    if (earningsPanelView === "netProfitFor") return "";
    if (!useConvertedEarnings || exchangeRatesLoading) return "";
    const metricKey = earningsPanelView === "earning" ? "earnings" : "netProfit";
    const convertedKey = earningsPanelView === "earning" ? "earningsConverted" : "netProfitConverted";
    const missing = earningsCurrencyRows.some((row) => {
      const raw = Number(row[metricKey]);
      if (!Number.isFinite(raw) || Math.abs(raw) < 0.005) return false;
      return row[convertedKey] == null;
    });
    // Surface when conversion is incomplete (failed FX fetch typically causes this).
    if (missing || (exchangeRatesError && useConvertedEarnings)) {
      return i18n.ratesUnavailable || "";
    }
    return "";
  }, [
    earningsPanelView,
    useConvertedEarnings,
    exchangeRatesLoading,
    exchangeRatesError,
    earningsCurrencyRows,
    i18n.ratesUnavailable,
  ]);

  const dateRangeText = useMemo(() => formatRangeLabel(dateFrom, dateTo), [dateFrom, dateTo]);
  const dateRangeShort = useMemo(
    () => formatRangeLabel(dateFrom, dateTo, { withYear: false }),
    [dateFrom, dateTo],
  );

  const applyPreset = useCallback((preset) => {
    const range = periodPresetRange(preset);
    if (!range) return;
    setActivePreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setBootstrapping(true);
  }, []);

  const setCustomDateRange = useCallback((nextFrom, nextTo) => {
    const from = String(nextFrom || "").trim();
    const to = String(nextTo || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
    if (from > to) {
      setDateFrom(to);
      setDateTo(from);
    } else {
      setDateFrom(from);
      setDateTo(to);
    }
    setActivePreset(null);
    setBootstrapping(true);
  }, []);

  const closeAccessModal = useCallback(() => {
    setAccessModal({ open: false, message: "" });
  }, []);

  const syncCompanySession = useCallback(
    async (id, signal) => {
      const { res, json } = await fetchJson(
        buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`),
        { signal },
      );
      if (!res.ok || !json?.success) {
        const reason = String(json?.data?.reason || "").toLowerCase();
        const msg = String(json?.message || json?.error || "");
        const lower = msg.toLowerCase();
        const shouldShowModal =
          reason === "expired" ||
          reason === "no_set" ||
          lower.includes("company has expired") ||
          lower.includes("group has expired") ||
          lower.includes("company expiration date is not set") ||
          lower.includes("date is not set");
        if (shouldShowModal) {
          const modalMessage =
            reason === "expired"
              ? i18n.companyAccessExpired
              : reason === "no_set" || lower.includes("not set")
                ? i18n.companyAccessNoSet
                : i18n.companyAccessExpired;
          setAccessModal({ open: true, message: modalMessage });
          throw new Error(modalMessage);
        }
        throw new Error(msg || i18n.loadError);
      }
      return json;
    },
    [i18n.loadError, i18n.companyAccessExpired, i18n.companyAccessNoSet],
  );

  // Reconcile illegal group-only scope (no ledger permission) — align with desktop.
  useEffect(() => {
    if (!me || !companies.length || loading) return;
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const isGroupOnly = Boolean(selectedGroup && !groupAllMode && !groupsAllMode && !hasCompany);
    if (!isGroupOnly) return;
    if (canUseGroupOnlyMode(me, selectedGroup, companies)) return;
    const pick = resolveCompanyPickForGroup(companies, selectedGroup, companyId);
    if (!pick?.id) return;
    void (async () => {
      try {
        await syncCompanySession(Number(pick.id));
        setCompanyId(Number(pick.id));
        setError("");
      } catch {
        /* keep error; user can retry via filter */
      }
    })();
  }, [me, companies, loading, selectedGroup, groupAllMode, groupsAllMode, companyId, syncCompanySession]);

  const switchCompany = useCallback(
    async (nextId) => {
      const id = Number(nextId);
      if (!Number.isFinite(id) || id <= 0) return;
      const sameCompany = Number(id) === Number(companyId);
      if (sameCompany && !groupAllMode && !groupsAllMode) return;
      const row = companies.find((c) => Number(c.id) === id);
      const seq = ++scopeSeq.current;
      scopeAbortRef.current?.abort();
      const ac = new AbortController();
      scopeAbortRef.current = ac;
      setBootstrapping(true);
      setError("");
      try {
        if (!sameCompany) {
          await syncCompanySession(id, ac.signal);
        }
        if (seq !== scopeSeq.current) return;
        setCompanyId(id);
        setSelectedGroup(selectedGroup ? resolveViewGroupForCompany(row, selectedGroup) : selectedGroup);
        setGroupsAllMode(false);
        setGroupAllMode(false);
      } catch (e) {
        if (e?.name === "AbortError" || seq !== scopeSeq.current) return;
        setError(e?.message || i18n.loadError);
        setBootstrapping(false);
      }
    },
    [companies, companyId, selectedGroup, groupAllMode, groupsAllMode, syncCompanySession, i18n.loadError],
  );

  const resetFilters = useCallback(() => {
    // Match first paint: This Month → today (not This Year).
    applyPreset("thisMonth");
    const fallback = pickCompany(companies, me?.company_id);
    const initial = resolveInitialMobileGcScope(me, companies, fallback);
    setGroupsAllMode(initial.groupsAllMode);
    setGroupAllMode(initial.groupAllMode);
    setSelectedGroup(initial.selectedGroup);
    if (initial.companyId && Number(initial.companyId) !== Number(companyId)) {
      void switchCompany(Number(initial.companyId));
    } else if (!initial.companyId) {
      setCompanyId(null);
    }
  }, [applyPreset, companies, me, companyId, switchCompany]);

  const pickGroup = useCallback(
    async (gid) => {
      const group = String(gid || "").trim().toUpperCase();
      if (!group) return;
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(group);
      setBootstrapping(true);
      setError("");

      if (canUseGroupOnlyMode(me, group, companies)) {
        setCompanyId(null);
        return;
      }

      const pick = resolveCompanyPickForGroup(companies, group, companyId);
      if (!pick?.id) {
        setBootstrapping(false);
        return;
      }
      const id = Number(pick.id);
      if (id === Number(companyId)) return;

      const seq = ++scopeSeq.current;
      scopeAbortRef.current?.abort();
      const ac = new AbortController();
      scopeAbortRef.current = ac;
      try {
        await syncCompanySession(id, ac.signal);
        if (seq !== scopeSeq.current) return;
        setCompanyId(id);
      } catch (e) {
        if (e?.name === "AbortError" || seq !== scopeSeq.current) return;
        setError(e?.message || i18n.loadError);
        setBootstrapping(false);
      }
    },
    [me, companies, companyId, syncCompanySession, i18n.loadError],
  );

  const pickAllGroups = useCallback(() => {
    // Desktop handlePickAllGroups: group-login → company aggregate (groupAllMode);
    // company-login with ledger privilege → groupsAll ledger; else preserve company / aggregate.
    const companyGroupsAllLedger = companyLoginCanUseGroupsAllLedger(me);
    const companyLoginGroupsAll =
      isCompanyLogin(me) && !isGroupLogin(me) && !companyGroupsAllLedger;
    const preserveCompanyId = (() => {
      if (!companyLoginGroupsAll) return null;
      const fromState = companyId != null ? Number(companyId) : NaN;
      if (Number.isFinite(fromState) && fromState > 0) return fromState;
      const fromMe = me?.company_id != null ? Number(me.company_id) : NaN;
      if (Number.isFinite(fromMe) && fromMe > 0) return fromMe;
      const first = resolveCompaniesForPicker(companies, {
        selectedGroup: null,
        groupsAllMode: true,
      })[0];
      const firstId = first?.id != null ? Number(first.id) : NaN;
      return Number.isFinite(firstId) && firstId > 0 ? firstId : null;
    })();
    const useCompanyAllAggregate = companyLoginGroupsAll && !preserveCompanyId;
    const groupLoginAllGroupsAggregate =
      isGroupLogin(me) && !companyGroupsAllLedger && !useCompanyAllAggregate;
    const nextGroupAllMode = companyGroupsAllLedger
      ? false
      : useCompanyAllAggregate || groupLoginAllGroupsAggregate;
    const nextCompanyId = companyGroupsAllLedger
      ? null
      : companyLoginGroupsAll && !useCompanyAllAggregate
        ? preserveCompanyId
        : null;

    setGroupsAllMode(true);
    setGroupAllMode(nextGroupAllMode);
    setSelectedGroup(null);
    setCompanyId(nextCompanyId);
  }, [me, companyId, companies]);

  const pickAllInGroup = useCallback(() => {
    // Desktop: Company All under Groups All keeps groupsAllMode + groupAllMode.
    if (groupsAllMode) {
      setGroupAllMode(true);
      setSelectedGroup(null);
      return;
    }
    if (!selectedGroup) return;
    setGroupsAllMode(false);
    setGroupAllMode(true);
    if (!(Number.isFinite(Number(companyId)) && Number(companyId) > 0)) {
      const first = resolveCompaniesForPicker(companies, {
        selectedGroup,
        groupsAllMode: false,
      })[0];
      if (first?.id != null) setCompanyId(Number(first.id));
    }
  }, [groupsAllMode, selectedGroup, companyId, companies]);

  const applyFilters = useCallback(
    async (draft) => {
      if (!draft) return;
      setBootstrapping(true);
      setError("");

      if (draft.activePreset) {
        const range = periodPresetRange(draft.activePreset);
        if (range) {
          setActivePreset(draft.activePreset);
          setDateFrom(range.dateFrom);
          setDateTo(range.dateTo);
        }
      } else if (draft.dateFrom && draft.dateTo) {
        setCustomDateRange(draft.dateFrom, draft.dateTo);
      }

      const nextIdentity = buildGcScopeIdentity({
        companyId: draft.companyId,
        selectedGroup: draft.selectedGroup,
        groupAllMode: draft.groupAllMode,
        groupsAllMode: draft.groupsAllMode,
      });
      const scopeChanged =
        Boolean(gcScopeIdentityRef.current) && gcScopeIdentityRef.current !== nextIdentity;
      if (scopeChanged) {
        // Match desktop resetCurrencyForCompanySwitch — re-pick first currency for new scope.
        preferFirstCurrencyRef.current = true;
      } else if (draft.currency) {
        setCurrency(String(draft.currency).toUpperCase());
      }

      if (draft.groupsAllMode) {
        setGroupsAllMode(true);
        setGroupAllMode(Boolean(draft.groupAllMode));
        setSelectedGroup(null);
        const cid = Number(draft.companyId);
        const nextCid =
          Number.isFinite(cid) && cid > 0 && !draft.groupAllMode ? cid : null;
        if (nextCid && Number(nextCid) !== Number(companyId)) {
          try {
            await syncCompanySession(nextCid);
          } catch (e) {
            setError(e?.message || i18n.loadError);
            setBootstrapping(false);
            return;
          }
        }
        setCompanyId(nextCid);
        return;
      }

      const group = draft.selectedGroup ? String(draft.selectedGroup).trim().toUpperCase() : null;

      if (group && draft.groupAllMode) {
        setGroupsAllMode(false);
        setGroupAllMode(true);
        setSelectedGroup(group);
        let cid = Number(draft.companyId);
        if (!Number.isFinite(cid) || cid <= 0) {
          const anchor = pickGroupAnchorCompany(companies, group);
          cid = anchor?.id != null ? Number(anchor.id) : null;
        }
        if (cid && Number(cid) !== Number(companyId)) {
          try {
            await syncCompanySession(cid);
          } catch (e) {
            setError(e?.message || i18n.loadError);
            setBootstrapping(false);
            return;
          }
        }
        if (cid) setCompanyId(cid);
        return;
      }

      if (group) {
        const allowGroupOnly = canUseGroupOnlyMode(me, group, companies);
        const draftCid = Number(draft.companyId);
        const hasCompany = Number.isFinite(draftCid) && draftCid > 0;

        if (!hasCompany && allowGroupOnly) {
          setGroupsAllMode(false);
          setGroupAllMode(false);
          setSelectedGroup(group);
          setCompanyId(null);
          return;
        }

        const pick = hasCompany
          ? companies.find((c) => Number(c.id) === draftCid)
          : resolveCompanyPickForGroup(companies, group, companyId);
        if (!pick?.id) {
          setBootstrapping(false);
          return;
        }

        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(group);
        if (Number(pick.id) !== Number(companyId)) {
          try {
            await syncCompanySession(Number(pick.id));
          } catch (e) {
            setError(e?.message || i18n.loadError);
            setBootstrapping(false);
            return;
          }
        }
        setCompanyId(Number(pick.id));
        return;
      }

      const cid = Number(draft.companyId);
      if (Number.isFinite(cid) && cid > 0) {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(null);
        if (Number(cid) !== Number(companyId)) {
          await switchCompany(cid);
        }
      }
    },
    [
      companies,
      companyId,
      me,
      setCustomDateRange,
      syncCompanySession,
      switchCompany,
      i18n.loadError,
    ],
  );

  const canUseGroupOnlyForGroup = useCallback(
    (gid) => canUseGroupOnlyMode(me, gid, companies),
    [me, companies],
  );

  const toggleChartSeries = useCallback((idx) => {
    setChartVisible((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } catch {
      /* continue */
    }
    navigate("/login", { replace: true });
  }, [navigate]);

  const retry = useCallback(() => {
    setError("");
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const canSoftReload =
      hasCompany || Boolean(selectedGroup) || groupsAllMode || groupAllMode;
    if (canSoftReload) {
      setReloadNonce((n) => n + 1);
      return;
    }
    setSessionNonce((n) => n + 1);
  }, [companyId, selectedGroup, groupsAllMode, groupAllMode]);

  // Publish GC scope for MobileRealtimeBridge SSE ticket.
  useEffect(() => {
    setMobileRealtimeScope(
      buildMobileRealtimeScopeFromGc({
        companyId,
        selectedGroup,
        groupsAllMode,
        groupAllMode,
      }),
    );
  }, [companyId, selectedGroup, groupsAllMode, groupAllMode]);

  const dashRealtimeEnabled =
    Number.isFinite(Number(companyId)) && Number(companyId) > 0
      ? true
      : Boolean(selectedGroup || groupsAllMode || groupAllMode);

  useRealtimeDomain(
    REALTIME_DOMAINS.LEDGER,
    () => {
      setReloadNonce((n) => n + 1);
    },
    { enabled: dashRealtimeEnabled },
  );

  // Fallback when SSE is down: focus/visibility + slow poll (SSE covers live updates).
  useEffect(() => {
    const softReload = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!dashRealtimeEnabled) return;
      setReloadNonce((n) => n + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") softReload();
    };
    window.addEventListener("focus", softReload);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(softReload, 180_000);
    return () => {
      window.removeEventListener("focus", softReload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [dashRealtimeEnabled]);

  const summaryPanelLabel =
    earningsPanelView === "earning"
      ? i18n.earnings
      : earningsPanelView === "netProfitFor"
        ? i18n.netProfitCompanyCaption
        : i18n.netProfit;

  return {
    i18n,
    lang,
    setLang,
    me,
    companies,
    groupIds,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    groupOnlyMode,
    companiesForPicker,
    companyId,
    selectedCompany,
    switchCompany,
    pickGroup,
    pickAllGroups,
    pickAllInGroup,
    applyFilters,
    canUseGroupOnlyForGroup,
    currency,
    setCurrency,
    currencies,
    exchangeRates,
    exchangeRatesLoading,
    ratesWarning,
    useConvertedEarnings,
    showMultiCurrencyNote,
    convertedNetProfitTotal,
    convertedEarningsTotal,
    heroCompare,
    dateFrom,
    dateTo,
    dateRangeText,
    dateRangeShort,
    activePreset,
    applyPreset,
    setCustomDateRange,
    resetFilters,
    kpi,
    compareLabel,
    chartRows,
    chartSeries,
    chartVisible,
    chartXAxisLayout,
    chartIsMonthly,
    toggleChartSeries,
    earningsCurrencyRows,
    panelCurrencyRows,
    earningsPanelView,
    setEarningsPanelView,
    showEarningPanelTab,
    showNetProfitForTab,
    showSummaryPanelTabs,
    summaryPanelLabel,
    summaryValue,
    loading: showLoading,
    refreshing,
    error,
    blocked,
    accessModal,
    closeAccessModal,
    logout,
    retry,
    hasData: dashboardDataIsUsable(bootstrap),
  };
}
