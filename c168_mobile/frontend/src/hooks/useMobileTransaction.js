import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMobileCurrencyCodes } from "../lib/dashboardCurrencies.js";
import {
  formatRangeLabel,
  periodPresetRange,
  todayYmd,
} from "../lib/dashboardDateUtils.js";
import {
  companiesForPicker as resolveCompaniesForPicker,
  pickCompany,
  pickGroupAnchorCompany,
  resolveCompanyPickForGroup,
  resolveInitialMobileGcScope,
  resolveMobileGroupIds,
} from "../lib/dashboardScope.js";
import { canUseGroupOnlyMode, filterCompaniesForUserScope } from "../lib/loginScope.js";
import { assertApiOk, fetchJson } from "../lib/fetchJson.js";
import {
  resolveMobileTransactionScope,
  transactionScopeApiParams,
  transactionScopeIsReady,
  resolveTransactionCurrencyOrderCompanyId,
} from "../lib/mobileTransactionScope.js";
import {
  applyOptimisticSubmitBalancePatch,
  applySummaryWinLossDisplayTolerance,
  applyTransactionDisplayFilters,
  applyTypeSearchAccountFilter,
  buildTransactionSearchQueryFilters,
  calculateTotals,
  hasSubmitFocusByCurrency,
  mergeSearchApiDataList,
  notifyTransactionListInvalidated,
  orderCurrencyRows,
  sanitizeSearchApiData,
  sortByRole,
  TX_DATA_CHANGED_EVENT,
  TX_LIST_INVALIDATE_HANDLED_KEY,
  TX_LIST_INVALIDATE_LS_KEY,
} from "../lib/transactionPaymentLogic.js";
import {
  approveContra,
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getUserCurrencyOrder,
  loadContraInbox,
  rejectContra,
  searchTransactions,
  submitTransaction,
  fetchTypeAccountSearch,
  fetchTypeTransactionSearch,
} from "../lib/transactionApi.js";
import {
  buildOptimisticSubmitDeltas,
  collectSubmitFocusAccountIds,
} from "../lib/transactionSubmitHelpers.js";
import { isPartnershipAuditReadOnlyLocked } from "../lib/partnershipAuditReadOnly.js";
import { clearMobileTxListSnapshot, readMobileTxListSnapshot } from "../lib/mobileTxListSnapshot.js";
import { TRANSACTION_I18N, getTransactionText } from "../translateFile/transactionTranslate.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import { canAccessTransaction, resolveMobileLandingPath } from "../utils/mobilePermissions.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import {
  buildMobileRealtimeScopeFromGc,
  setMobileRealtimeScope,
} from "../lib/realtime/mobileRealtimeScope.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";

const COMPANIES_API = "api/transactions/get_owner_companies_api.php";

function isManagerOrAbove(me) {
  const role = String(me?.role || "").trim().toLowerCase();
  return role === "manager" || role === "admin" || role === "owner";
}

export function useMobileTransaction({ listPaused = false } = {}) {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const t = useMemo(() => getTransactionText.bind(null, lang), [lang]);
  const m = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);
  const i18n = useMemo(
    () => ({
      ...(DASHBOARD_I18N[lang] || DASHBOARD_I18N.en),
      ...m,
    }),
    [lang, m],
  );

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [currency, setCurrency] = useState("MYR");
  /** At least one currency required — never "ALL currencies". */
  const [selectedCurrencies, setSelectedCurrencies] = useState(["MYR"]);
  const [currencies, setCurrencies] = useState(["MYR"]);
  const [currenciesReady, setCurrenciesReady] = useState(false);
  const filtersBeforeTypeSearchRef = useRef(null);
  /** Desktop TX parity: Capture Date defaults to today (not This Year / This Month). */
  const [dateFrom, setDateFrom] = useState(() => todayYmd());
  const [dateTo, setDateTo] = useState(() => todayYmd());
  const [activePreset, setActivePreset] = useState("today");

  const [showName, setShowName] = useState(false);
  const [showCaptureOnly, setShowCaptureOnly] = useState(false);
  const [showPaymentOnly, setShowPaymentOnly] = useState(false);
  const [showZeroBalance, setShowZeroBalance] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [typeSearchActive, setTypeSearchActive] = useState(false);
  const [typeSearchFormType, setTypeSearchFormType] = useState("");
  /** Post-submit focused account ids by currency (desktop applySubmitFocusAndRefresh slim). */
  const [submitFocusByCurrency, setSubmitFocusByCurrency] = useState({});
  const [submitFocusRangeKey, setSubmitFocusRangeKey] = useState(null);
  const [contraInbox, setContraInbox] = useState({ open: false, items: [], loading: false });

  const [rawSearchData, setRawSearchData] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [accountOptions, setAccountOptions] = useState([]);
  const [formCurrencies, setFormCurrencies] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast] = useState(null);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const searchSeq = useRef(0);
  /** After restoring a list snapshot (Back from history), skip the next auto search once. */
  const skipNextSearchRef = useRef(false);
  /** First Type Search entry: query all currencies today, then narrow to codes with activity. */
  const typeSearchDiscoverCodesRef = useRef(null);
  /** Track Payment History pause so Back does not auto re-search. */
  const listPausedRef = useRef(listPaused);
  const rawSearchDataRef = useRef(rawSearchData);
  rawSearchDataRef.current = rawSearchData;

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

  const transactionScope = useMemo(
    () =>
      resolveMobileTransactionScope({
        companies,
        companyId,
        selectedGroup,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, companyId, selectedGroup, groupsAllMode, groupAllMode],
  );

  const scopeApi = useMemo(() => transactionScopeApiParams(transactionScope), [transactionScope]);
  const scopeReady = useMemo(() => transactionScopeIsReady(transactionScope), [transactionScope]);

  const groupOnlyMode = Boolean(
    selectedGroup && !groupAllMode && !groupsAllMode && !(Number.isFinite(Number(companyId)) && Number(companyId) > 0),
  );

  const mutationsBlocked = Boolean(
    isPartnershipAuditReadOnlyLocked(me) ||
      (transactionScope?.groupsAllMode && !transactionScope?.groupAllMode),
  );

  const pushToast = useCallback((message, tone = "info") => {
    setToast({ message, tone, id: Date.now() });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const captureRangeKey = `${dateFrom || ""}|${dateTo || ""}`;
  const submitFocusActive =
    hasSubmitFocusByCurrency(submitFocusByCurrency) && submitFocusRangeKey === captureRangeKey;
  const listFocusActive = typeSearchActive || submitFocusActive;

  const displayRows = useMemo(() => {
    let left = Array.isArray(rawSearchData?.left_table) ? rawSearchData.left_table : [];
    let right = Array.isArray(rawSearchData?.right_table) ? rawSearchData.right_table : [];
    if (submitFocusActive) {
      const allIds = new Set();
      for (const ids of Object.values(submitFocusByCurrency || {})) {
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          const n = Number(id);
          if (Number.isFinite(n) && n > 0) allIds.add(n);
        }
      }
      if (allIds.size > 0) {
        const focused = applyTypeSearchAccountFilter(left, right, allIds);
        left = focused.left;
        right = focused.right;
      }
    }
    const merged = sortByRole([...left, ...right]);
    return applyTransactionDisplayFilters(merged, {
      showZero: listFocusActive ? true : showZeroBalance,
      showPaymentOnly: listFocusActive ? false : showPaymentOnly,
      showWinLossOnly: listFocusActive ? false : showCaptureOnly,
    });
  }, [
    rawSearchData,
    showZeroBalance,
    showPaymentOnly,
    showCaptureOnly,
    submitFocusActive,
    submitFocusByCurrency,
    listFocusActive,
  ]);

  const totals = useMemo(() => {
    if (!displayRows.length) return rawSearchData?.totals?.summary || null;
    return applySummaryWinLossDisplayTolerance(calculateTotals(displayRows));
  }, [displayRows, rawSearchData]);

  const dateRangeText = useMemo(() => formatRangeLabel(dateFrom, dateTo), [dateFrom, dateTo]);

  const currencyCodesForSearch = useMemo(() => {
    const available = currencies.filter((c) => c && c !== "ALL");
    const fallback = available[0] || "MYR";
    const picked = selectedCurrencies
      .map((c) => String(c || "").toUpperCase().trim())
      .filter((c) => c && c !== "ALL" && (!available.length || available.includes(c)));
    return picked.length ? picked : [fallback];
  }, [selectedCurrencies, currencies]);

  const currencyFilterLabel = useMemo(() => {
    const codes = currencyCodesForSearch;
    if (codes.length === 1) return codes[0];
    return `${codes.length}`;
  }, [currencyCodesForSearch]);

  const runSearch = useCallback(
    async (signal) => {
      if (!scopeReady) return;
      const seq = ++searchSeq.current;
      setSearchLoading(true);
      setSearchError("");
      try {
        const queryFilters = buildTransactionSearchQueryFilters({
          showZeroBalance,
          showPaymentOnly,
          showCaptureOnly,
        });

        const discoverCodes = typeSearchDiscoverCodesRef.current;
        const codesForQuery =
          Array.isArray(discoverCodes) && discoverCodes.length
            ? discoverCodes
            : currencyCodesForSearch;

        const paramsBase = {
          ...scopeApi,
          dateFrom,
          dateTo,
          showInactive: queryFilters.showInactiveForQuery,
          showCaptureOnly: queryFilters.showCaptureOnlyForQuery,
          hideZeroBalance: queryFilters.hideZeroBalanceForQuery,
          currencyCodes: codesForQuery,
          categories: selectedCategories,
          typeSearch: typeSearchActive,
          typeSearchFormType: typeSearchActive ? typeSearchFormType : undefined,
        };

        const PERIOD_TYPE_SEARCH_TYPES = new Set([
          "CONTRA",
          "PAYMENT",
          "CLAIM",
          "CLEAR",
          "RATE",
          "ADJUSTMENT",
          "PROFIT",
          "ALL",
        ]);
        const normalizedType = String(typeSearchFormType || "ALL").toUpperCase().trim();
        const usePeriodTypeSearch =
          typeSearchActive && PERIOD_TYPE_SEARCH_TYPES.has(normalizedType || "ALL");
        const useTxnTypeSearch =
          typeSearchActive && normalizedType && !PERIOD_TYPE_SEARCH_TYPES.has(normalizedType);

        let currentData = null;

        if (useTxnTypeSearch) {
          currentData = await fetchTypeTransactionSearch({
            ...scopeApi,
            transactionType: normalizedType,
            currencyCodes: codesForQuery,
            signal,
          });
          if (seq !== searchSeq.current || signal?.aborted) return;
          if (!currentData) {
            setSearchError(m.searchFailed);
            return;
          }
        } else {
          if (usePeriodTypeSearch) {
            try {
              const ids = await fetchTypeAccountSearch({
                ...scopeApi,
                // Same as desktop: Capture Date × all pure manual types (ignore form Type).
                transactionType: "ALL",
                signal,
              });
              if (signal?.aborted) return;
              paramsBase.typeAccountIds = ids;
              paramsBase.typeSearchFormType = "ALL";
            } catch {
              /* still run search without ids */
            }
          }

          if (transactionScope?.mode === "aggregate" && transactionScope.mergeCompanyIds?.length) {
            const results = await Promise.all(
              transactionScope.mergeCompanyIds.map((cid) =>
                searchTransactions({
                  ...paramsBase,
                  companyId: cid,
                  viewGroup: scopeApi.viewGroup || undefined,
                  groupId: undefined,
                  signal,
                }),
              ),
            );
            if (seq !== searchSeq.current || signal?.aborted) return;
            const payloads = results.filter((r) => r?.success && r?.data).map((r) => r.data);
            if (!payloads.length) {
              setRawSearchData({ left_table: [], right_table: [], totals: null });
              return;
            }
            currentData = mergeSearchApiDataList(payloads);
          } else {
            const result = await searchTransactions({ ...paramsBase, signal });
            if (seq !== searchSeq.current || signal?.aborted) return;
            if (!result?.success || !result?.data) {
              setSearchError(result?.message || result?.error || m.searchFailed);
              return;
            }
            currentData = result.data;
          }
        }

        let cleaned = sanitizeSearchApiData(currentData);
        if (typeSearchActive) {
          const hasTypeSearchMovement = (row) => {
            if (!row) return false;
            if (Number(row?.has_crdr_transactions) === 1 || Number(row?.has_win_loss_transactions) === 1) {
              return true;
            }
            if (Number(row?.has_contra_clear_period) === 1) return true;
            const wl = parseFloat(String(row?.win_loss ?? "").replace(/,/g, "")) || 0;
            const wlFull = parseFloat(String(row?.win_loss_full ?? "").replace(/,/g, "")) || 0;
            if (Math.abs(wl) > 0.0001 || Math.abs(wlFull) > 0.0001) return true;
            const crDr = parseFloat(String(row?.cr_dr ?? "").replace(/,/g, "")) || 0;
            return Math.abs(crDr) > 0.0001;
          };
          cleaned = sanitizeSearchApiData({
            ...cleaned,
            left_table: (cleaned.left_table || []).filter(hasTypeSearchMovement),
            right_table: (cleaned.right_table || []).filter(hasTypeSearchMovement),
          });
        }

        // Desktop parity: first Type Search entry discovers currencies with activity today.
        if (typeSearchDiscoverCodesRef.current) {
          typeSearchDiscoverCodesRef.current = null;
          const foundSet = new Set();
          [...(cleaned.left_table || []), ...(cleaned.right_table || [])].forEach((row) => {
            const cur = String(row?.currency || "").toUpperCase().trim();
            if (cur) foundSet.add(cur);
          });
          const order = currencies
            .map((c) => String(c || "").toUpperCase().trim())
            .filter((c) => c && c !== "ALL");
          let focusCurrencies = [...foundSet].sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
          if (!focusCurrencies.length) {
            focusCurrencies = [order[0] || "MYR"];
          }
          const focusSet = new Set(focusCurrencies);
          cleaned = sanitizeSearchApiData({
            ...cleaned,
            left_table: (cleaned.left_table || []).filter((row) =>
              focusSet.has(String(row?.currency || "").toUpperCase().trim()),
            ),
            right_table: (cleaned.right_table || []).filter((row) =>
              focusSet.has(String(row?.currency || "").toUpperCase().trim()),
            ),
          });
          skipNextSearchRef.current = true;
          setSelectedCurrencies(focusCurrencies);
          setCurrency(focusCurrencies[0]);
        }

        setRawSearchData(cleaned);
      } catch (e) {
        if (signal?.aborted || e?.name === "AbortError") return;
        setSearchError(e?.message || m.searchFailed);
      } finally {
        if (seq === searchSeq.current && !signal?.aborted) setSearchLoading(false);
      }
    },
    [
      scopeReady,
      scopeApi,
      transactionScope,
      dateFrom,
      dateTo,
      showZeroBalance,
      showPaymentOnly,
      showCaptureOnly,
      currencyCodesForSearch,
      currencies,
      selectedCategories,
      typeSearchActive,
      typeSearchFormType,
      m.searchFailed,
    ],
  );

  const loadAccountsAndCurrencies = useCallback(
    async (signal) => {
      if (!scopeReady) return;
      const orderCid = resolveTransactionCurrencyOrderCompanyId(transactionScope, companies);
      try {
        const [accRes, curRes, ordRes] = await Promise.all([
          getAccounts({ ...scopeApi, status: "active", signal }),
          getCompanyCurrencies({ ...scopeApi, signal }),
          orderCid
            ? getUserCurrencyOrder({ companyId: orderCid, signal }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (signal?.aborted) return;

        const accList = Array.isArray(accRes?.data) ? accRes.data : [];
        setAccountOptions(
          accList.map((a) => ({
            id: a.id,
            account_id: a.account_id,
            display_text: a.display_text || `${a.account_id}${a.name ? ` - ${a.name}` : ""}`,
            currency: a.currency,
            role: a.role,
          })),
        );

        const curRows = Array.isArray(curRes?.data) ? curRes.data : [];
        const ordered = orderCurrencyRows(curRows, ordRes, orderCid);
        const codes = ordered
          .map((r) => String(r.code || r.currency || "").trim().toUpperCase())
          .filter(Boolean);
        setFormCurrencies(codes.length ? [...new Set(codes)] : currencies);
      } catch {
        if (!signal?.aborted) setFormCurrencies(currencies);
      }
    },
    [scopeReady, scopeApi, currencies, transactionScope, companies],
  );

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
        if (!canAccessTransaction(user)) {
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
        const snap = readMobileTxListSnapshot();
        if (snap) {
          setCompanies(filterCompaniesForUserScope(list, user));
          const snapCid = snap.companyId != null ? Number(snap.companyId) : null;
          setCompanyId(Number.isFinite(snapCid) && snapCid > 0 ? snapCid : null);
          setSelectedGroup(snap.selectedGroup ? String(snap.selectedGroup) : null);
          setGroupsAllMode(Boolean(snap.groupsAllMode));
          setGroupAllMode(Boolean(snap.groupAllMode));
          if (Array.isArray(snap.selectedCurrencies)) {
            const restored = snap.selectedCurrencies
              .map((c) => String(c || "").toUpperCase())
              .filter((c) => c && c !== "ALL");
            if (restored.length) setSelectedCurrencies(restored);
          }
          if (snap.currency) {
            const code = String(snap.currency).toUpperCase();
            if (code && code !== "ALL") setCurrency(code);
          }
          if (snap.dateFrom) setDateFrom(String(snap.dateFrom));
          if (snap.dateTo) setDateTo(String(snap.dateTo));
          if (snap.activePreset != null) setActivePreset(String(snap.activePreset));
          setShowName(Boolean(snap.showName));
          setShowCaptureOnly(Boolean(snap.showCaptureOnly));
          setShowPaymentOnly(Boolean(snap.showPaymentOnly));
          setShowZeroBalance(Boolean(snap.showZeroBalance));
          setSelectedCategories(Array.isArray(snap.selectedCategories) ? snap.selectedCategories : []);
          setTypeSearchActive(Boolean(snap.typeSearchActive));
          setTypeSearchFormType(snap.typeSearchFormType ? String(snap.typeSearchFormType) : "");
          if (snap.rawSearchData && typeof snap.rawSearchData === "object") {
            setRawSearchData(sanitizeSearchApiData(snap.rawSearchData));
            skipNextSearchRef.current = true;
          }
        } else {
          const scoped = filterCompaniesForUserScope(list, user);
          const picked = pickCompany(scoped, user.company_id);
          if (!picked) throw new Error(i18n.loadError);

          const initial = resolveInitialMobileGcScope(user, scoped, picked);
          setCompanies(scoped);
          setCompanyId(initial.companyId);
          setSelectedGroup(initial.selectedGroup);
          setGroupsAllMode(initial.groupsAllMode);
          setGroupAllMode(initial.groupAllMode);
        }

        const catRes = await getCategories();
        if (!ac.signal.aborted && catRes?.success && Array.isArray(catRes.data)) {
          setCategories(catRes.data);
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
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    if (!companies.length || (!hasCompany && !groupOnlyMode && !groupsAllMode && !groupAllMode)) {
      return undefined;
    }
    const ac = new AbortController();
    setCurrenciesReady(false);
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
        const fallback = next[0] || "MYR";
        setCurrencies(next);
        setSelectedCurrencies((prev) => {
          const kept = (prev || []).filter((c) => next.includes(c) && c !== "ALL");
          return kept.length ? kept : [fallback];
        });
        setCurrency((prev) => {
          if (prev && prev !== "ALL" && next.includes(prev)) return prev;
          return fallback;
        });
      } catch {
        if (!ac.signal.aborted) setCurrencies(["MYR"]);
      } finally {
        if (!ac.signal.aborted) setCurrenciesReady(true);
      }
    })();
    return () => ac.abort();
  }, [companies, companyId, selectedGroup, groupAllMode, groupsAllMode, groupOnlyMode]);

  useEffect(() => {
    if (!scopeReady || !currenciesReady) return undefined;

    const wasPaused = listPausedRef.current;
    listPausedRef.current = listPaused;

    // On Payment History: do not run list search (and abort any in-flight via cleanup).
    if (listPaused) {
      return undefined;
    }

    // Back from History: keep existing rows — no auto pull/re-search.
    if (wasPaused && rawSearchDataRef.current) {
      return undefined;
    }

    const ac = new AbortController();
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      void loadAccountsAndCurrencies(ac.signal);
      return () => ac.abort();
    }
    void runSearch(ac.signal);
    void loadAccountsAndCurrencies(ac.signal);
    return () => ac.abort();
  }, [
    scopeReady,
    currenciesReady,
    reloadNonce,
    listPaused,
    runSearch,
    loadAccountsAndCurrencies,
  ]);

  const captureListSnapshot = useCallback(
    () => ({
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      currency,
      selectedCurrencies,
      dateFrom,
      dateTo,
      activePreset,
      showName,
      showCaptureOnly,
      showPaymentOnly,
      showZeroBalance,
      selectedCategories,
      typeSearchActive,
      typeSearchFormType,
      rawSearchData,
    }),
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      currency,
      selectedCurrencies,
      dateFrom,
      dateTo,
      activePreset,
      showName,
      showCaptureOnly,
      showPaymentOnly,
      showZeroBalance,
      selectedCategories,
      typeSearchActive,
      typeSearchFormType,
      rawSearchData,
    ],
  );

  const switchCompany = useCallback(async (id) => {
    const cid = Number(id);
    if (!Number.isFinite(cid) || cid <= 0) return;
    setCompanyId(cid);
    setGroupAllMode(false);
  }, []);

  const pickGroup = useCallback(
    (groupId) => {
      const g = groupId ? String(groupId).trim().toUpperCase() : null;
      if (!g) return;
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(g);
      if (canUseGroupOnlyMode(me, g, companies)) {
        setCompanyId(null);
        return;
      }
      const pick = resolveCompanyPickForGroup(companies, g, companyId);
      if (pick?.id != null) setCompanyId(Number(pick.id));
    },
    [me, companies, companyId],
  );

  const pickAllGroups = useCallback(() => {
    setSelectedGroup(null);
    setCompanyId(null);
    setGroupsAllMode(true);
    setGroupAllMode(false);
  }, []);

  const pickAllInGroup = useCallback(() => {
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
  }, [selectedGroup, companyId, companies]);

  const applyFilters = useCallback(
    (draft) => {
      if (!draft) return;

      if (draft.activePreset) {
        const range = periodPresetRange(draft.activePreset);
        if (range) {
          setActivePreset(draft.activePreset);
          setDateFrom(range.dateFrom);
          setDateTo(range.dateTo);
        }
      } else if (draft.dateFrom && draft.dateTo) {
        setDateFrom(draft.dateFrom);
        setDateTo(draft.dateTo);
        setActivePreset("");
      }

      if (Array.isArray(draft.selectedCurrencies)) {
        const next = draft.selectedCurrencies
          .map((c) => String(c || "").toUpperCase().trim())
          .filter((c) => c && c !== "ALL");
        const fallback = currencies.filter((c) => c && c !== "ALL")[0] || "MYR";
        const resolved = next.length ? next : [fallback];
        setSelectedCurrencies(resolved);
        setCurrency(resolved[0]);
      } else if (draft.currency) {
        const code = String(draft.currency).toUpperCase();
        const fallback = currencies.filter((c) => c && c !== "ALL")[0] || "MYR";
        if (!code || code === "ALL") {
          setSelectedCurrencies([fallback]);
          setCurrency(fallback);
        } else {
          setSelectedCurrencies([code]);
          setCurrency(code);
        }
      }
      if (Array.isArray(draft.selectedCategories)) setSelectedCategories(draft.selectedCategories);

      if (draft.groupsAllMode) {
        setGroupsAllMode(true);
        setGroupAllMode(false);
        setSelectedGroup(null);
        setCompanyId(null);
        setReloadNonce((n) => n + 1);
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
        if (cid) setCompanyId(cid);
        setReloadNonce((n) => n + 1);
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
          setReloadNonce((n) => n + 1);
          return;
        }

        const pick = hasCompany
          ? companies.find((c) => Number(c.id) === draftCid)
          : resolveCompanyPickForGroup(companies, group, companyId);
        if (!pick?.id) return;

        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(group);
        setCompanyId(Number(pick.id));
        setReloadNonce((n) => n + 1);
        return;
      }

      const cid = Number(draft.companyId);
      if (Number.isFinite(cid) && cid > 0) {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(null);
        setCompanyId(cid);
        setReloadNonce((n) => n + 1);
      }
    },
    [companies, companyId, me, currencies],
  );

  const canUseGroupOnlyForGroup = useCallback(
    (gid) => canUseGroupOnlyMode(me, gid, companies),
    [me, companies],
  );

  const applyPreset = useCallback((key) => {
    const range = periodPresetRange(key);
    if (!range) return;
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setActivePreset(key);
    setReloadNonce((n) => n + 1);
  }, []);

  const setCustomDateRange = useCallback((from, to) => {
    if (from) setDateFrom(from);
    if (to) setDateTo(to);
    setActivePreset("");
    setReloadNonce((n) => n + 1);
  }, []);

  const resetFilters = useCallback(() => {
    const today = todayYmd();
    const fallback = currencies.filter((c) => c && c !== "ALL")[0] || "MYR";
    setDateFrom(today);
    setDateTo(today);
    setActivePreset("today");
    setShowName(false);
    setShowCaptureOnly(false);
    setShowPaymentOnly(false);
    setShowZeroBalance(false);
    setSelectedCurrencies([fallback]);
    setCurrency(fallback);
    setSelectedCategories([]);
    setTypeSearchActive(false);
    setTypeSearchFormType("");
    filtersBeforeTypeSearchRef.current = null;
    setReloadNonce((n) => n + 1);
  }, [currencies]);

  const refreshContraInboxBadge = useCallback(
    async (api = scopeApi) => {
      if (!scopeReady || !api || !isManagerOrAbove(me)) {
        setContraInbox((s) => ({ ...s, items: [], loading: false }));
        return;
      }
      setContraInbox((s) => ({ ...s, loading: true }));
      try {
        const res = await loadContraInbox({ ...api });
        const items = Array.isArray(res?.data) ? res.data : [];
        setContraInbox((s) => ({ ...s, items, loading: false }));
      } catch {
        setContraInbox((s) => ({ ...s, loading: false }));
      }
    },
    [scopeReady, scopeApi, me],
  );

  useEffect(() => {
    if (!scopeReady || !currenciesReady) return undefined;
    void refreshContraInboxBadge();
    return undefined;
  }, [scopeReady, currenciesReady, reloadNonce, refreshContraInboxBadge]);

  // Desktop parity: refresh list when maintenance (or other tabs) invalidates TX data.
  useEffect(() => {
    if (!scopeReady || listPaused) return undefined;

    const readHandled = () => {
      try {
        return parseInt(sessionStorage.getItem(TX_LIST_INVALIDATE_HANDLED_KEY) || "0", 10) || 0;
      } catch {
        return 0;
      }
    };
    const markHandled = (ts) => {
      try {
        sessionStorage.setItem(TX_LIST_INVALIDATE_HANDLED_KEY, String(ts));
      } catch {
        /* ignore */
      }
    };

    let refreshInFlight = false;
    let pendingRefresh = false;

    const refreshFromInvalidate = () => {
      const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
      const handledTs = readHandled();
      if (!invalidateTs || invalidateTs <= handledTs) return;
      if (refreshInFlight) {
        pendingRefresh = true;
        return;
      }
      refreshInFlight = true;
      pendingRefresh = false;
      setReloadNonce((n) => n + 1);
      markHandled(invalidateTs);
      refreshInFlight = false;
      if (pendingRefresh) {
        pendingRefresh = false;
        refreshFromInvalidate();
      }
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    };
    const onStorage = (e) => {
      if (!e || e.key !== TX_LIST_INVALIDATE_LS_KEY) return;
      refreshFromInvalidate();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    window.addEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
    refreshFromInvalidate();
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
      clearInterval(poll);
    };
  }, [scopeReady, listPaused]);

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

  // SSE LEDGER → silent list / contra badge refresh (bridge also notifies TX_DATA_CHANGED).
  useRealtimeDomain(
    REALTIME_DOMAINS.LEDGER,
    () => {
      if (listPaused) return;
      setReloadNonce((n) => n + 1);
    },
    { enabled: scopeReady && !listPaused },
  );

  // Fallback when SSE is down: focus / visibility + slow poll.
  useEffect(() => {
    if (!scopeReady || listPaused) return undefined;
    const softReload = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
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
  }, [scopeReady, listPaused]);

  const runTypeSearch = useCallback(
    (txType) => {
      const tType = String(txType || "").toUpperCase().trim();
      if (!tType) return;

      // First entry: snapshot filters, clear to today (desktop parity).
      if (!typeSearchActive) {
        if (!filtersBeforeTypeSearchRef.current) {
          filtersBeforeTypeSearchRef.current = {
            selectedCategories: [...selectedCategories],
            selectedCurrencies: [...selectedCurrencies],
            currency,
            dateFrom,
            dateTo,
            activePreset,
            showName,
            showPaymentOnly,
            showCaptureOnly,
            showZeroBalance,
          };
        }
        const today = todayYmd();
        const available = currencies.filter((c) => c && c !== "ALL");
        typeSearchDiscoverCodesRef.current = available.length ? available : ["MYR"];
        setDateFrom(today);
        setDateTo(today);
        setActivePreset("today");
        setSelectedCategories([]);
        // Keep prior currency chips until discover narrows; query uses discover ref.
        setShowName(false);
        setShowPaymentOnly(false);
        setShowCaptureOnly(false);
        setShowZeroBalance(false);
      }

      setTypeSearchActive(true);
      // Period types: list uses ALL (Capture Date × any pure manual type).
      const PERIOD = new Set([
        "CONTRA",
        "PAYMENT",
        "CLAIM",
        "CLEAR",
        "RATE",
        "ADJUSTMENT",
        "PROFIT",
        "ALL",
      ]);
      setTypeSearchFormType(PERIOD.has(tType) ? "ALL" : tType);
      setReloadNonce((n) => n + 1);
    },
    [
      typeSearchActive,
      selectedCategories,
      selectedCurrencies,
      currency,
      currencies,
      dateFrom,
      dateTo,
      activePreset,
      showName,
      showPaymentOnly,
      showCaptureOnly,
      showZeroBalance,
    ],
  );

  const exitTypeSearch = useCallback(() => {
    clearMobileTxListSnapshot();
    typeSearchDiscoverCodesRef.current = null;
    const snap = filtersBeforeTypeSearchRef.current;
    filtersBeforeTypeSearchRef.current = null;
    setTypeSearchActive(false);
    setTypeSearchFormType("");
    setSubmitFocusByCurrency({});
    setSubmitFocusRangeKey(null);
    if (snap) {
      setSelectedCategories(Array.isArray(snap.selectedCategories) ? snap.selectedCategories : []);
      {
        const fallback = currencies.filter((c) => c && c !== "ALL")[0] || "MYR";
        const restored = Array.isArray(snap.selectedCurrencies)
          ? snap.selectedCurrencies
              .map((c) => String(c || "").toUpperCase())
              .filter((c) => c && c !== "ALL")
          : [];
        const next = restored.length ? restored : [fallback];
        setSelectedCurrencies(next);
        const snapCur = String(snap.currency || "").toUpperCase();
        setCurrency(snapCur && snapCur !== "ALL" ? snapCur : next[0]);
      }
      if (snap.dateFrom) setDateFrom(snap.dateFrom);
      if (snap.dateTo) setDateTo(snap.dateTo);
      setActivePreset(snap.activePreset || "");
      setShowName(Boolean(snap.showName));
      setShowPaymentOnly(Boolean(snap.showPaymentOnly));
      setShowCaptureOnly(Boolean(snap.showCaptureOnly));
      setShowZeroBalance(Boolean(snap.showZeroBalance));
    }
    setReloadNonce((n) => n + 1);
  }, [currencies]);

  const applySubmitFocusAndRefresh = useCallback(
    ({ accountIds, submitCurrency, transactionDate, amount, txType, toAccountId, fromAccountId } = {}) => {
      const ids = [...new Set((accountIds || []).map((id) => Number(id)).filter((id) => id > 0))];
      if (ids.length === 0) return;

      const txDate = String(transactionDate || "").trim();
      const currencyCodes = [
        ...new Set(
          (Array.isArray(submitCurrency) ? submitCurrency : [submitCurrency])
            .map((c) => String(c || "").toUpperCase().trim())
            .filter((c) => c && c !== "ALL"),
        ),
      ];

      // Snapshot left filters once so Exit restores the pre-focus list (desktop Type Search session).
      if (!filtersBeforeTypeSearchRef.current) {
        filtersBeforeTypeSearchRef.current = {
          selectedCategories: [...selectedCategories],
          selectedCurrencies: [...selectedCurrencies],
          currency,
          dateFrom,
          dateTo,
          activePreset,
          showName,
          showPaymentOnly,
          showCaptureOnly,
          showZeroBalance,
        };
      }

      if (txDate) {
        setDateFrom(txDate);
        setDateTo(txDate);
        setActivePreset("");
      }
      setSelectedCategories([]);
      setShowPaymentOnly(false);
      setShowCaptureOnly(false);
      setShowZeroBalance(true);
      setTypeSearchActive(false);
      setTypeSearchFormType("");

      if (currencyCodes.length > 0) {
        setSelectedCurrencies(currencyCodes);
        setCurrency(currencyCodes[0]);
      }

      const rangeKey = txDate ? `${txDate}|${txDate}` : `${dateFrom}|${dateTo}`;
      const didJumpCaptureDate = Boolean(txDate && (txDate !== dateFrom || txDate !== dateTo));
      setSubmitFocusByCurrency((prev) => {
        const base = !didJumpCaptureDate && submitFocusRangeKey === rangeKey ? { ...prev } : {};
        const codes = currencyCodes.length ? currencyCodes : [String(currency || "MYR").toUpperCase()];
        for (const code of codes) {
          const existing = Array.isArray(base[code]) ? base[code] : [];
          base[code] = [...new Set([...existing, ...ids])];
        }
        return base;
      });
      setSubmitFocusRangeKey(rangeKey);

      // Skip optimistic patch when jumping dates — old-range rows are the wrong base.
      const type = String(txType || "").toUpperCase();
      const primaryCurrency = currencyCodes[0] || "";
      if (!didJumpCaptureDate && type && type !== "RATE" && primaryCurrency) {
        const deltas = buildOptimisticSubmitDeltas({
          txType: type,
          amount,
          toAccountId,
          fromAccountId,
        });
        if (deltas.length) {
          setRawSearchData((prev) =>
            applyOptimisticSubmitBalancePatch(prev, {
              currency: primaryCurrency,
              deltas,
            }),
          );
        }
      }

      notifyTransactionListInvalidated("mobile_tx_submit_focus");
      setReloadNonce((n) => n + 1);
    },
    [
      selectedCategories,
      selectedCurrencies,
      currency,
      dateFrom,
      dateTo,
      activePreset,
      showName,
      showPaymentOnly,
      showCaptureOnly,
      showZeroBalance,
      submitFocusRangeKey,
    ],
  );

  const onApproveContra = useCallback(
    async (transactionId) => {
      if (mutationsBlocked) {
        pushToast(m.readOnlyModeCannotSubmit, "error");
        return;
      }
      const res = await approveContra({ transactionId, ...scopeApi });
      if (res?.success) {
        pushToast(res.message || m.approve, "success");
        notifyTransactionListInvalidated("mobile_contra_approve");
        void refreshContraInboxBadge();
        setReloadNonce((n) => n + 1);
      } else {
        pushToast(res?.message || m.submitFailed, "error");
      }
    },
    [mutationsBlocked, scopeApi, pushToast, m, refreshContraInboxBadge],
  );

  const onRejectContra = useCallback(
    async (transactionId) => {
      if (mutationsBlocked) {
        pushToast(m.readOnlyModeCannotSubmit, "error");
        return;
      }
      const res = await rejectContra({ transactionId, ...scopeApi });
      if (res?.success) {
        pushToast(res.message || m.reject, "success");
        notifyTransactionListInvalidated("mobile_contra_reject");
        void refreshContraInboxBadge();
        setReloadNonce((n) => n + 1);
      } else {
        pushToast(res?.message || m.submitFailed, "error");
      }
    },
    [mutationsBlocked, scopeApi, pushToast, m, refreshContraInboxBadge],
  );

  const retry = useCallback(() => {
    // Pull-to-refresh while in type/submit focus → exit to default list.
    if (typeSearchActive || submitFocusActive) {
      exitTypeSearch();
      return;
    }
    setReloadNonce((n) => n + 1);
  }, [typeSearchActive, submitFocusActive, exitTypeSearch]);

  const logout = useCallback(async () => {
    try {
      await fetch(buildApiUrl("api/session/logout_api.php"), { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    navigate("/login", { replace: true });
  }, [navigate]);

  const submitTx = useCallback(
    async (payload, clientRequestId) => {
      if (!scopeReady) {
        pushToast(m.submitFailed, "error");
        return { success: false };
      }
      if (mutationsBlocked) {
        pushToast(m.readOnlyModeCannotSubmit, "error");
        return { success: false };
      }
      try {
        const res = await submitTransaction({
          ...scopeApi,
          groupAggregate: scopeApi.groupAggregate || transactionScope?.mode === "group",
          payload,
          clientRequestId,
        });
        if (res?.success) {
          const approvalStatus = res?.data?.approval_status
            ? String(res.data.approval_status).toUpperCase()
            : "";
          if (approvalStatus === "PENDING") {
            pushToast(m.submittedWaitingApproval, "info");
            void refreshContraInboxBadge();
            return res;
          }

          pushToast(
            res?.message ||
              (payload.transaction_type === "RATE" ? m.rateTransactionSubmitted : m.transactionSubmitted),
            "success",
          );

          const txType = String(payload.transaction_type || "").toUpperCase();
          const toAccountId = payload.account_id;
          const fromAccountId = payload.from_account_id;
          const accountIds = collectSubmitFocusAccountIds({
            txType,
            toAccountId,
            fromAccountId,
            isAdjustment: txType === "ADJUSTMENT",
            rateToAccountId: payload.rate_to_account_id || payload.account_id,
            rateFromAccountId: payload.rate_from_account_id || payload.from_account_id,
            rateTransferToAccountId: payload.rate_transfer_to_account_id || payload.rate_transfer_to_account,
            rateTransferFromAccountId:
              payload.rate_transfer_from_account_id || payload.rate_transfer_from_account,
            rateMiddlemanAccountId: payload.rate_middleman_account_id,
          });
          const submitCurrency =
            txType === "RATE"
              ? [
                  String(payload.rate_currency_from || "").toUpperCase().trim(),
                  String(payload.rate_currency_to || "").toUpperCase().trim(),
                ].filter(Boolean)
              : String(payload.currency || "").toUpperCase().trim();

          applySubmitFocusAndRefresh({
            accountIds,
            submitCurrency,
            transactionDate: payload.transaction_date,
            amount: payload.amount,
            txType,
            toAccountId,
            fromAccountId,
          });
          void refreshContraInboxBadge();
          return res;
        }
        pushToast(res?.message || m.submitFailed, "error");
        return res;
      } catch {
        pushToast(m.networkError, "error");
        return { success: false };
      }
    },
    [
      scopeReady,
      scopeApi,
      transactionScope,
      mutationsBlocked,
      pushToast,
      m,
      refreshContraInboxBadge,
      applySubmitFocusAndRefresh,
    ],
  );

  const orderCompanyId = useMemo(
    () => resolveTransactionCurrencyOrderCompanyId(transactionScope, companies),
    [transactionScope, companies],
  );

  return {
    i18n,
    m,
    t,
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
    currency: currencyFilterLabel,
    setCurrency,
    selectedCurrencies,
    setSelectedCurrencies,
    currencies,
    formCurrencies,
    dateFrom,
    dateTo,
    dateRangeText,
    activePreset,
    applyPreset,
    setCustomDateRange,
    resetFilters,
    showName,
    setShowName,
    showCaptureOnly,
    setShowCaptureOnly,
    showPaymentOnly,
    setShowPaymentOnly,
    showZeroBalance,
    setShowZeroBalance,
    categories,
    selectedCategories,
    setSelectedCategories,
    toggleCategory: (cat) => {
      setSelectedCategories((prev) => {
        const c = String(cat || "");
        if (!c) return prev;
        return prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c];
      });
    },
    typeSearchActive,
    typeSearchFormType,
    submitFocusActive,
    listFocusActive,
    runTypeSearch,
    exitTypeSearch,
    contraInbox,
    setContraInbox,
    canUseContraInbox: isManagerOrAbove(me),
    refreshContraInboxBadge,
    onApproveContra,
    onRejectContra,
    displayRows,
    totals,
    rawSearchData,
    searchLoading,
    searchError,
    accountOptions,
    transactionScope,
    scopeApi,
    scopeReady,
    mutationsBlocked,
    orderCompanyId,
    loading,
    error,
    blocked,
    toast,
    pushToast,
    submitTx,
    captureListSnapshot,
    retry,
    logout,
  };
}
