import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import { canShowReportInSidebar } from "../../../utils/auth/sidebarPermissions.js";
import {
  getCachedOwnerCompanies,
  DASHBOARD_GROUP_FILTER_KEY,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  isDashboardGroupOnlyMode,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
  fetchOwnerCompaniesAll,
  fetchOwnerGroupsAll,
  resolveGcFilterBootCompanyId,
  readPersistedDashboardGcFilter,
  readDashboardSelectedCompanyId,
  companiesInGroupList,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  notifyDashboardCurrencyFilterChanged,
  resolveCrossPageCurrencyPreference,
  buildDashboardCurrencyScopeKey,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  isGroupLedgerDeniedError,
  persistReportCompaniesCache,
  readReportCompaniesCache,
  resolveReportCompanyWhenClosingGroup,
  resolveReportGroupOnlyBoot,
} from "../shared/reportGcBoot.js";
import { useCrossPageCurrencySync } from "../../../utils/company/useCrossPageCurrencySync.js";
import {
  mergeCurrencyCodesWithSavedOrder,
  persistCurrencyDisplayOrder,
  persistUserCurrencyDisplayOrder,
  resolveSavedCurrencyOrder,
} from "../../../utils/company/currencyDisplayOrder.js";
import { useReportGroupCompanyFilter } from "../shared/useReportGroupCompanyFilter.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/maintenance_notifications.css";
import { fetchAccounts, fetchCustomerReport } from "./customerReportApi.js";
import { saveUserCurrencyOrder } from "../../transaction/lib/transactionApi.js";
import {
  fetchCompanyPermissions,
  fetchReportScopeCurrencies,
  isBankOnlyCategoryCompany,
} from "../shared/reportCompanyApi.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { getReportText, REPORT_I18N } from "../../../translateFile/pages/reportTranslate.js";
import CustomerReportFilters from "./CustomerReportFilters.jsx";
import CustomerReportTable from "./CustomerReportTable.jsx";
import { reportToastMaintenanceVariant } from "../shared/reportAmountFormat.js";
import { useRealtimeDomain } from "../../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";
import {
  buildReportSnapshotKey,
  getReportSnapshot,
  setReportSnapshot,
} from "../shared/reportPageSnapshotCache.js";
import { useReportAbortSeq } from "../shared/useReportAbortSeq.js";
import {
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../shared/reportScope.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { syncCompanySessionInBackground } from "../../../utils/company/companySessionSwitchCore.js";

const REPORT_PAGE_KEY = "customer";
const REPORT_FETCH_DEBOUNCE_MS = 150;
function sameCodeList(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] || "").toUpperCase() !== String(b[i] || "").toUpperCase()) return false;
  }
  return true;
}

function resolveReportBootCompanyId() {
  const cached = getCachedOwnerCompanies() || readReportCompaniesCache();
  const url = new URL(window.location.href);
  const queryCompany = url.searchParams.get("company_id");
  return resolveBootCompanyId({
    urlCompanyId: queryCompany,
    defaultRowId: cached?.[0]?.id,
  });
}

export default function CustomerReportPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);
  const r = useMemo(() => REPORT_I18N[lang] || REPORT_I18N.en, [lang]);

  const [companies, setCompanies] = useState(
    () => getCachedOwnerCompanies() || readReportCompaniesCache() || [],
  );

  const [companyId, setCompanyId] = useState(resolveReportBootCompanyId);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    const g = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    return g ? String(g).trim().toUpperCase() : null;
  });
  const companySessionAbortRef = useRef(null);
  const [accountId, setAccountId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  /** Avoid report fetch before currency filter is resolved (prevents ALL-data flash). */
  const [currencyFilterReady, setCurrencyFilterReady] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  const [accounts, setAccounts] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const reportDataRef = useRef(null);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const { begin: beginReportFetch, invalidate: invalidateReportFetch, isCurrent: isReportFetchCurrent } =
    useReportAbortSeq();
  const { begin: beginMetaFetch, invalidate: invalidateMetaFetch, isCurrent: isMetaFetchCurrent } =
    useReportAbortSeq();
  const pageBootOnceRef = useRef(false);
  const prevCompanyIdRef = useRef(null);
  const prevScopeKeyRef = useRef(null);
  /** Per-company / per-group currency filter prefs */
  const currencyPrefsByCompanyRef = useRef({});
  const selectedCurrenciesRef = useRef(selectedCurrencies);
  const showAllCurrenciesRef = useRef(showAllCurrencies);

  useEffect(() => {
    selectedCurrenciesRef.current = selectedCurrencies;
  }, [selectedCurrencies]);

  useEffect(() => {
    showAllCurrenciesRef.current = showAllCurrencies;
  }, [showAllCurrencies]);

  useEffect(() => {
    reportDataRef.current = reportData;
  }, [reportData]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    for (const href of links) {
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    return () => {
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!me || companyId != null) return;
    if (isDashboardGroupOnlyMode()) return;
    const cached = getCachedOwnerCompanies();
    const url = new URL(window.location.href);
    const queryCompany = url.searchParams.get("company_id");
    const effective = resolveBootCompanyId({
      urlCompanyId: queryCompany,
      sessionCompanyId: me.company_id,
      defaultRowId: cached?.[0]?.id,
    });
    if (effective != null) setCompanyId(effective);
  }, [me, companyId]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (pageBootOnceRef.current) return;
    pageBootOnceRef.current = true;

    const u = me;
    if (!canShowReportInSidebar(u)) {
      navigate(spaPath("dashboard"), { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchOwnerCompaniesAll({ me: u });
        await fetchOwnerGroupsAll(u).catch(() => null);
        if (cancelled) return;
        setCompanies(rows);
        persistReportCompaniesCache(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const persistedGc = readPersistedDashboardGcFilter();
        const savedCompanyId = readDashboardSelectedCompanyId();
        const bootGc = resolveGcFilterBootCompanyId({
          urlCompanyId: queryCompany,
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
        let bootGroup = groupFilterOptOut
          ? null
          : persistedGc.selectedGroup ||
            bootGc.selectedGroup ||
            resolveInitialSelectedGroupFromSession(rows, null, u);
        const groupOnlyBoot = groupFilterOptOut
          ? false
          : resolveReportGroupOnlyBoot(u, bootGc, persistedGc, bootGroup);
        // A saved company selection always wins over the group-only guess — group-only boot
        // only applies when there is genuinely no company to restore.
        let nextCompanyId = companyId != null ? companyId : bootGc.companyId;
        if (groupFilterOptOut && nextCompanyId == null) {
          const pick = resolveReportCompanyWhenClosingGroup(
            u,
            rows,
            null,
            sortedUniqueGroupIds(rows),
          );
          if (pick?.id != null) nextCompanyId = Number(pick.id);
        }
        if (nextCompanyId == null && savedCompanyId != null && bootGroup) {
          const inGroup = companiesInGroupList(rows, bootGroup).some(
            (c) => Number(c.id) === Number(savedCompanyId),
          );
          if (inGroup) nextCompanyId = savedCompanyId;
        }
        if (nextCompanyId != null) {
          persistDashboardGroupOnlyMode(false);
          if (bootGroup) {
            persistDashboardFilterState(bootGroup, nextCompanyId, { allowGroupOnly: false });
          }
        } else if (groupOnlyBoot) {
          persistDashboardGroupOnlyMode(true);
        }
        const row =
          nextCompanyId != null
            ? rows.find((c) => Number(c.id) === Number(nextCompanyId)) || null
            : null;
        if (!groupFilterOptOut) {
          bootGroup = resolveInitialSelectedGroupFromSession(rows, row, u) || bootGroup;
        }
        setCompanyId((prev) => (prev != null ? prev : nextCompanyId));
        setSelectedGroup(groupFilterOptOut ? null : bootGroup);
        if (nextCompanyId != null) void checkBankOnly(nextCompanyId);
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate, companyId]);

  useEffect(() => {
    if (!companies.length) return;
    const groupFilterOptOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
    if (groupFilterOptOut) {
      setSelectedGroup((prev) => (prev == null ? prev : null));
      return;
    }
    const row =
      companyId != null
        ? companies.find((c) => Number(c.id) === Number(companyId)) || null
        : null;
    setSelectedGroup((prev) => {
      const resolved = resolveInitialSelectedGroupFromSession(companies, row, me);
      if (resolved) return resolved;
      const g = prev ? String(prev).trim().toUpperCase() : "";
      if (g && sortedUniqueGroupIds(companies).includes(g)) return g;
      return prev;
    });
  }, [companies, companyId, me]);

  const checkBankOnly = useCallback(async (compId) => {
    if (!compId) return;
    try {
      const comp = companies.find(c => Number(c.id) === Number(compId));
      const perms = await fetchCompanyPermissions(comp?.company_id || "");
      if (isBankOnlyCategoryCompany(perms)) {
        // Bank-only companies use Bank Process UI, not Games process-list.
        navigate(spaPath("bank-process-list"), { replace: true });
      }
    } catch (err) {
      console.error("Bank only check error:", err);
    }
  }, [companies, navigate]);

  const handleClearCompany = useCallback(
    (groupForScope) => {
      const groupKey = String(groupForScope || selectedGroup || "")
        .trim()
        .toUpperCase();
      persistDashboardFilterState(groupKey || null, null);
      invalidateReportFetch();
      flushSync(() => setCompanyId(null));
      setError("");
      setAccountId("");
      if (reportDataRef.current != null) setReportSyncing(true);
      setCurrencyFilterReady(false);
    },
    [invalidateReportFetch, selectedGroup],
  );

  const onPrepareCompanySelect = useCallback((c) => {
    const nextId = Number(c?.id);
    if (!nextId) return;
    const fromRow = c?.group_id ? String(c.group_id).trim().toUpperCase() : "";
    const fromSel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
    const groupForPersist = fromRow || fromSel || null;
    persistDashboardFilterState(groupForPersist, nextId, { allowGroupOnly: false });
    persistDashboardGroupOnlyMode(false);
    flushSync(() => {
      if (groupForPersist) setSelectedGroup(groupForPersist);
      setCompanyId(nextId);
    });
    if (reportDataRef.current != null) setReportSyncing(true);
    startTransition(() => {
      setAccountId("");
      setCurrencyFilterReady(false);
    });
  }, [selectedGroup]);

  const onSwitchCompany = useCallback(
    async (c) => {
      if (!c?.id) return;
      const nextId = Number(c.id);
      const previousCompanyId = companyId;
      void checkBankOnly(nextId);

      companySessionAbortRef.current?.abort();
      const ac = new AbortController();
      companySessionAbortRef.current = ac;

      const ok = await syncCompanySessionInBackground({
        companyId: nextId,
        sessionCompanyId: me?.company_id,
        signal: ac.signal,
        layoutSilent: true,
        onFailure: () => {
          if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
            flushSync(() => setCompanyId(previousCompanyId));
          }
          setReportSyncing(false);
          notify(t("switchFailed"), "danger");
        },
      });
      if (!ok) return;
    },
    [checkBankOnly, companyId, me?.company_id, notify, t],
  );

  const {
    groupIds,
    companiesForPicker: companyButtons,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
    allowClearCompany,
  } = useReportGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany: onSwitchCompany,
    onClearCompany: handleClearCompany,
    switchingCompany: false,
    preferredCompanyId: companyId,
  });

  /** Stale company (e.g. Bank TK1) with empty/mismatched pills must not drive Games report scope. */
  const scopeCompanyId = useMemo(() => {
    if (companyId == null) return null;
    const cid = Number(companyId);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    if (!companyButtons.some((c) => Number(c.id) === cid)) return null;
    return cid;
  }, [companyId, companyButtons]);

  useEffect(() => {
    if (companyId == null) return;
    if (scopeCompanyId != null) return;
    // Drop invisible/stale company so Group-only ledger requests succeed.
    handleClearCompany(selectedGroup);
  }, [companyId, scopeCompanyId, selectedGroup, handleClearCompany]);

  useEffect(() => {
    if (scopeCompanyId == null) return;
    void checkBankOnly(scopeCompanyId);
  }, [scopeCompanyId, checkBankOnly]);

  const reportScope = useMemo(
    () =>
      resolveCustomerReportScope({
        companies,
        selectedGroup,
        companyId: scopeCompanyId,
        groupsAllMode,
        groupAllMode,
        me,
      }),
    [companies, selectedGroup, scopeCompanyId, groupsAllMode, groupAllMode, me],
  );

  /** Cross-page order key: numeric company id, or `g:GROUP` for a group ledger. */
  const reportCurrencyOrderKey = useMemo(() => {
    const cid = reportScope?.scopeCompanyId > 0 ? Number(reportScope.scopeCompanyId) : 0;
    if (Number.isFinite(cid) && cid > 0) return cid;
    const vg = String(reportScope?.viewGroup || reportScope?.groupId || "")
      .trim()
      .toUpperCase();
    return vg ? `g:${vg}` : null;
  }, [reportScope]);

  const reportCurrencyCodes = useMemo(
    () => currencyList.map((c) => c.code).filter(Boolean),
    [currencyList],
  );

  const applyCrossPageCurrency = useCallback((code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies([code]);
  }, []);

  const { persistSelection: persistCrossPageCurrency } = useCrossPageCurrencySync({
    enabled: currencyFilterReady && reportCurrencyCodes.length > 0,
    companyId: reportScope?.scopeCompanyId > 0 ? reportScope.scopeCompanyId : companyId,
    selectedGroup: reportScope?.viewGroup ?? selectedGroup,
    availableCodes: reportCurrencyCodes,
    currentCode: selectedCurrencies.length === 1 ? selectedCurrencies[0] : "",
    onApplyCode: applyCrossPageCurrency,
  });

  /**
   * Frontend's group-only pre-check can wrongly allow entering a group ledger the session
   * isn't actually assigned to; when the backend rejects it, fall back to a reportable
   * subsidiary instead of leaving the page stuck in an unusable single-group state.
   * On a cold page load `companies` may still be empty at the moment the request fails
   * (nothing cached yet) — `groupLedgerDenied` remembers to retry once it arrives.
   */
  const [groupLedgerDenied, setGroupLedgerDenied] = useState(false);

  const tryRecoverFromGroupLedgerDenied = useCallback(() => {
    if (companyId != null) return false;
    const pick = resolveReportCompanyWhenClosingGroup(me, companies, companyId, groupIds);
    if (!pick?.id) return false;
    setGroupLedgerDenied(false);
    onPrepareCompanySelect(pick);
    return true;
  }, [companyId, companies, me, groupIds, onPrepareCompanySelect]);

  useEffect(() => {
    if (!groupLedgerDenied || companyId != null || !companies.length) return;
    tryRecoverFromGroupLedgerDenied();
  }, [groupLedgerDenied, companies, companyId, tryRecoverFromGroupLedgerDenied]);

  const reportParams = useMemo(
    () => ({
      accountId,
      dateFrom,
      dateTo,
      showAll,
      reportScope,
      selectedCurrencies,
      showAllCurrencies,
      scopeKey: customerReportScopeCacheKey(reportScope),
    }),
    [
      accountId,
      dateFrom,
      dateTo,
      showAll,
      reportScope,
      selectedCurrencies,
      showAllCurrencies,
    ],
  );

  const loadReport = useCallback(async () => {
    if (!customerReportScopeIsReady(reportScope) || !dateFrom || !dateTo) return;
    const { signal, seq } = beginReportFetch();
    const quietRefresh = reportDataRef.current != null;
    if (quietRefresh) setReportSyncing(true);
    setError("");
    try {
      const data = await fetchCustomerReport(reportParams, { signal });
      if (!isReportFetchCurrent(seq)) return;
      if (!quietRefresh && !data?.data?.length) {
        notify(t("noDataAdjustSearch"), "info");
      }
      startTransition(() => {
        setReportData(data);
      });
      setReportSnapshot(REPORT_PAGE_KEY, buildReportSnapshotKey(reportParams), data);
    } catch (err) {
      if (err?.name === "AbortError" || !isReportFetchCurrent(seq)) return;
      if (isGroupLedgerDeniedError(err)) {
        if (tryRecoverFromGroupLedgerDenied()) return;
        setGroupLedgerDenied(true);
      }
      const msg = err.message || t("loadReportFailed");
      setError(msg);
      notify(msg, "error");
      startTransition(() => {
        setReportData(null);
      });
    } finally {
      if (isReportFetchCurrent(seq)) {
        setReportSyncing(false);
      }
    }
  }, [
    reportScope,
    dateFrom,
    dateTo,
    reportParams,
    beginReportFetch,
    isReportFetchCurrent,
    t,
    notify,
    tryRecoverFromGroupLedgerDenied,
  ]);

  useRealtimeDomain(REALTIME_DOMAINS.LEDGER, () => {
    void loadReport();
  }, { enabled: customerReportScopeIsReady(reportScope) && currencyFilterReady });

  const persistCurrencyPrefs = useCallback((scope, currencies, showAll) => {
    const key = customerReportScopeCacheCompanyKey(scope);
    if (key == null) return;
    currencyPrefsByCompanyRef.current[key] = {
      selectedCurrencies: currencies,
      showAllCurrencies: showAll,
    };
    if (!showAll && currencies?.length >= 1) {
      notifyDashboardCurrencyFilterChanged(
        currencies[currencies.length - 1],
        buildDashboardCurrencyScopeKey({
          companyId: scope?.scopeCompanyId > 0 ? scope.scopeCompanyId : null,
          selectedGroup: scope?.viewGroup ?? selectedGroup,
        }) || String(key),
      );
    }
  }, [selectedGroup]);

  const applySavedCurrencyPrefs = useCallback((scope, curs) => {
    const key = customerReportScopeCacheCompanyKey(scope);
    const saved = key != null ? currencyPrefsByCompanyRef.current[key] : null;
    if (!saved) return false;
    if (saved.showAllCurrencies) {
      setShowAllCurrencies(true);
      setSelectedCurrencies([]);
      return true;
    }
    if (saved.selectedCurrencies?.length > 0) {
      const valid = saved.selectedCurrencies.filter((code) =>
        curs.some((c) => c.code === code),
      );
      if (valid.length > 0) {
        setSelectedCurrencies(valid);
        setShowAllCurrencies(false);
        return true;
      }
    }
    return false;
  }, []);

  /** Apply the shared cross-page order (user-global → scope) to fetched currency rows. */
  const orderReportCurrencies = useCallback(
    (curs) => {
      if (!Array.isArray(curs) || curs.length === 0) return curs || [];
      if (reportCurrencyOrderKey == null) return curs;
      const savedOrder = resolveSavedCurrencyOrder(reportCurrencyOrderKey, null);
      if (!savedOrder?.length) return curs;
      const byCode = new Map(
        curs.map((row) => [String(row?.code || "").toUpperCase(), row]),
      );
      const codes = mergeCurrencyCodesWithSavedOrder(
        curs.map((row) => row?.code),
        savedOrder,
      );
      const ordered = codes.map((code) => byCode.get(code)).filter(Boolean);
      return ordered.length ? ordered : curs;
    },
    [reportCurrencyOrderKey],
  );

  /** Drag reorder — writes the shared cross-page order so every page follows. */
  const handleCurrencyDropOn = useCallback(
    async (e, targetCode) => {
      e.preventDefault();
      const dragged = e.dataTransfer?.getData("text/plain");
      if (!dragged || !targetCode || dragged === targetCode) return;
      const list = [...currencyList];
      const fromI = list.findIndex((row) => row?.code === dragged);
      const toI = list.findIndex((row) => row?.code === targetCode);
      if (fromI < 0 || toI < 0 || fromI === toI) return;
      const next = [...list];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      setCurrencyList(next);
      const codes = next.map((row) => row?.code).filter(Boolean);
      persistUserCurrencyDisplayOrder(codes);
      if (reportCurrencyOrderKey != null) {
        persistCurrencyDisplayOrder(reportCurrencyOrderKey, codes);
      }
      try {
        const cid =
          reportScope?.scopeCompanyId > 0 ? Number(reportScope.scopeCompanyId) : 0;
        await saveUserCurrencyOrder(codes, {
          companyId: Number.isFinite(cid) && cid > 0 ? cid : undefined,
          groupId:
            !(Number.isFinite(cid) && cid > 0)
              ? reportScope?.viewGroup || reportScope?.groupId || undefined
              : undefined,
        });
      } catch {
        /* localStorage already updated on drag */
      }
    },
    [currencyList, reportCurrencyOrderKey, reportScope],
  );

  const loadMetaData = useCallback(async () => {
    if (!customerReportScopeIsReady(reportScope)) return;
    const { signal, seq } = beginMetaFetch();
    try {
      const curs = await fetchReportScopeCurrencies(reportScope, { signal });
      if (!isMetaFetchCurrent(seq)) return;
      const accs = await fetchAccounts(reportScope, { signal });
      if (!isMetaFetchCurrent(seq)) return;
      setAccounts(accs);
      setCurrencyList(orderReportCurrencies(curs));

      if (applySavedCurrencyPrefs(reportScope, curs)) return;

      if (showAllCurrenciesRef.current) {
        setShowAllCurrencies(true);
        setSelectedCurrencies([]);
        persistCurrencyPrefs(reportScope, [], true);
        return;
      }

      const validCurrent = selectedCurrenciesRef.current.filter((code) =>
        curs.some((c) => c.code === code),
      );
      if (validCurrent.length > 0) {
        setShowAllCurrencies(false);
        setSelectedCurrencies((prev) => (sameCodeList(prev, validCurrent) ? prev : validCurrent));
        persistCurrencyPrefs(reportScope, validCurrent, false);
        return;
      }

      if (curs.length > 0) {
        const persistedCur = resolveCrossPageCurrencyPreference({
          scopeKey: buildDashboardCurrencyScopeKey({
            companyId: reportScope?.scopeCompanyId > 0 ? reportScope.scopeCompanyId : null,
            selectedGroup: reportScope?.viewGroup ?? selectedGroup,
          }),
          availableCodes: curs.map((c) => c.code),
        });
        const fromPersisted = persistedCur
          ? curs.find((c) => c.code === persistedCur)
          : null;
        const myr = curs.find((c) => c.code === "MYR");
        const def = fromPersisted || myr || curs[0];
        const codes = [def.code];
        setSelectedCurrencies(codes);
        setShowAllCurrencies(false);
        persistCurrencyPrefs(reportScope, codes, false);
      }
    } catch (err) {
      if (err?.name === "AbortError" || !isMetaFetchCurrent(seq)) return;
      console.error("Meta data load error:", err);
    } finally {
      if (isMetaFetchCurrent(seq)) {
        setCurrencyFilterReady(true);
      }
    }
  }, [
    reportScope,
    applySavedCurrencyPrefs,
    persistCurrencyPrefs,
    beginMetaFetch,
    isMetaFetchCurrent,
    orderReportCurrencies,
  ]);

  useEffect(() => {
    if (!companyId) return;
    const prev = prevCompanyIdRef.current;
    if (prev != null && Number(prev) !== Number(companyId)) {
      invalidateReportFetch();
      setReportSyncing(false);
      const prevScope = resolveCustomerReportScope({
        companies,
        selectedGroup,
        companyId: prev,
        me,
      });
      persistCurrencyPrefs(
        prevScope,
        selectedCurrenciesRef.current,
        showAllCurrenciesRef.current,
      );
      const savedKey = customerReportScopeCacheCompanyKey(
        resolveCustomerReportScope({ companies, selectedGroup, companyId, me }),
      );
      const saved = savedKey != null ? currencyPrefsByCompanyRef.current[savedKey] : null;
      if (saved?.showAllCurrencies) {
        setShowAllCurrencies(true);
        setSelectedCurrencies([]);
        setCurrencyFilterReady(true);
      } else if (saved?.selectedCurrencies?.length) {
        setSelectedCurrencies([...saved.selectedCurrencies]);
        setShowAllCurrencies(false);
        setCurrencyFilterReady(true);
      } else {
        setSelectedCurrencies([]);
        setShowAllCurrencies(false);
        setCurrencyFilterReady(false);
      }
      setAccountId("");
      if (reportDataRef.current != null) setReportSyncing(true);
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, companies, selectedGroup, me, persistCurrencyPrefs, invalidateReportFetch]);

  useEffect(() => {
    if (!currencyFilterReady) {
      invalidateReportFetch();
      setReportSyncing(false);
    }
  }, [currencyFilterReady, invalidateReportFetch]);

  useEffect(() => {
    if (!customerReportScopeIsReady(reportScope)) {
      setCurrencyFilterReady(false);
      return;
    }
    setCurrencyFilterReady(false);
    loadMetaData();
  }, [reportScope, loadMetaData]);

  useEffect(() => {
    const scopeKey = customerReportScopeCacheKey(reportScope);
    const prev = prevScopeKeyRef.current;
    if (prev != null && prev !== scopeKey) {
      invalidateReportFetch();
      setError("");
      setAccountId("");
    }
    prevScopeKeyRef.current = scopeKey || null;
  }, [reportScope, invalidateReportFetch]);

  useEffect(() => {
    if (!customerReportScopeIsReady(reportScope) || !currencyFilterReady) return undefined;
    const handler = window.setTimeout(() => {
      loadReport();
    }, REPORT_FETCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handler);
      invalidateReportFetch();
    };
  }, [reportScope, currencyFilterReady, loadReport, invalidateReportFetch]);

  useEffect(() => {
    if (!customerReportScopeIsReady(reportScope) || !currencyFilterReady) return;
    const key = buildReportSnapshotKey(reportParams);
    const snap = getReportSnapshot(REPORT_PAGE_KEY);
    if (snap?.key === key && snap.data && reportDataRef.current == null) {
      reportDataRef.current = snap.data;
      startTransition(() => {
        setReportData(snap.data);
      });
    }
  }, [reportScope, currencyFilterReady, reportParams]);

  const toggleCurrency = (code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      persistCurrencyPrefs(reportScope, next, false);
      if (next.includes(code)) persistCrossPageCurrency(code);
      return next;
    });
  };

  const toggleAllCurrencies = () => {
    const nextAll = !showAllCurrencies;
    setShowAllCurrencies(nextAll);
    if (nextAll) {
      setSelectedCurrencies([]);
      persistCurrencyPrefs(reportScope, [], true);
    } else {
      persistCurrencyPrefs(reportScope, selectedCurrenciesRef.current, false);
    }
  };

  return (
    <div className="container">
      <div className="content">
        <CustomerReportFilters
          companyId={scopeCompanyId}
          onSwitchCompany={handlePickCompany}
          onClearCompany={handleClearCompany}
          allowClearCompany={allowClearCompany}
          groupIds={groupIds}
          selectedGroup={selectedGroup}
          onPickGroup={handlePickGroup}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          companyButtons={companyButtons}
          highlightCompanyId={scopeCompanyId}
          accountId={accountId}
          setAccountId={setAccountId}
          accounts={accounts}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          showAll={showAll}
          setShowAll={setShowAll}
          currencyList={currencyList}
          selectedCurrencies={selectedCurrencies}
          toggleCurrency={toggleCurrency}
          showAllCurrencies={showAllCurrencies}
          toggleAllCurrencies={toggleAllCurrencies}
          currencyDraggable
          onCurrencyDropOn={handleCurrencyDropOn}
          t={t}
          monthLabels={r.monthsShort}
          weekdaysShort={r.weekdaysShort}
        />

        <div className="customer-report-table-region">
          {reportSyncing && reportData != null && (
            <div className="customer-report-sync-track" aria-hidden>
              <div className="customer-report-sync-bar" />
            </div>
          )}
          <CustomerReportTable
            reportData={reportData}
            reportSyncing={reportSyncing}
            error={error}
            currencyList={currencyList}
            showAllCurrencies={showAllCurrencies}
            selectedCurrencies={selectedCurrencies}
            t={t}
          />
        </div>
      </div>

      {toast && (
        <div id="customerReportNotificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${reportToastMaintenanceVariant(toast.type)} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
