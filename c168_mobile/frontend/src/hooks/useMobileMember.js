import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../lib/fetchJson.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import {
  applyCurrencyAllToggle,
  applyCurrencyToggle,
  accountHoldsMiniGridCurrency,
  computeMiniGridTotals,
  getMemberMiniGridCurrencies,
  groupHistoryForDisplay,
  hasScope,
  mapBatchAccountCurrencies,
  mapLinkedAccountsApiList,
  parseJsonResponse,
  scopeQueryFields,
  todayYmd,
  ymdToDmy,
} from "../lib/memberHelpers.js";
import { fetchAccountHistoryClosingBalance } from "../lib/memberBalanceApi.js";
import { getMemberText, memberText, translateMemberApiMessage } from "../translateFile/memberTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";

export function useMobileMember() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => memberText(lang), [lang]);
  const t = useCallback((key, params) => getMemberText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [loginRootAccountId, setLoginRootAccountId] = useState(0);
  const [viewAccountId, setViewAccountId] = useState(0);
  const [companyId, setCompanyId] = useState(0);
  const [groupId, setGroupId] = useState("");
  const [dateFromYmd, setDateFromYmd] = useState(() => todayYmd());
  const [dateToYmd, setDateToYmd] = useState(() => todayYmd());
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [ownedCurrencies, setOwnedCurrencies] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [tableDisplayContext, setTableDisplayContext] = useState({
    isAllSelected: true,
    selectedCurrencies: [],
    currencyOrder: [],
  });
  const [loadingTable, setLoadingTable] = useState(false);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceMap, setBalanceMap] = useState(() => new Map());
  const [balanceTotals, setBalanceTotals] = useState(() => new Map());
  const [balanceCurrencies, setBalanceCurrencies] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [linkedAccountCurrenciesMap, setLinkedAccountCurrenciesMap] = useState(() => new Map());
  const [linkedCurrenciesLoaded, setLinkedCurrenciesLoaded] = useState(false);

  const historyAbortRef = useRef(null);
  const balancesAbortRef = useRef(null);
  const toastTimer = useRef(null);
  const searchSeqRef = useRef(0);
  const balancesSeqRef = useRef(0);
  const linkedAccountsRef = useRef(linkedAccounts);
  linkedAccountsRef.current = linkedAccounts;
  const linkedCcyMapRef = useRef(linkedAccountCurrenciesMap);
  linkedCcyMapRef.current = linkedAccountCurrenciesMap;
  const linkedCcyLoadedRef = useRef(linkedCurrenciesLoaded);
  linkedCcyLoadedRef.current = linkedCurrenciesLoaded;

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const notify = useCallback((message, tone = "success") => {
    if (!message) return;
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const availableCurrencies = useMemo(
    () => ownedCurrencies.map((o) => o.code).filter(Boolean),
    [ownedCurrencies],
  );

  const groupedRows = useMemo(
    () =>
      groupHistoryForDisplay(
        historyRows,
        tableDisplayContext.isAllSelected,
        tableDisplayContext.selectedCurrencies,
        tableDisplayContext.currencyOrder,
      ),
    [historyRows, tableDisplayContext],
  );

  const loadOwnedCurrencies = useCallback(async (accountId, compId, gid) => {
    if (!accountId || !hasScope(compId, gid)) {
      setOwnedCurrencies([]);
      return [];
    }
    try {
      const params = new URLSearchParams({
        action: "get_account_currencies",
        account_id: String(accountId),
        ...scopeQueryFields(compId, gid),
      });
      const res = await fetch(buildApiUrl(`api/accounts/account_currency_api.php?${params}`), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await parseJsonResponse(await res.text());
      if (!json?.success || !Array.isArray(json.data)) {
        setOwnedCurrencies([]);
        return [];
      }
      const list = json.data
        .map((row) => ({
          code: String(row.currency_code || row.code || "")
            .trim()
            .toUpperCase(),
        }))
        .filter((o) => o.code);
      setOwnedCurrencies(list);
      return list.map((o) => o.code);
    } catch {
      setOwnedCurrencies([]);
      return [];
    }
  }, []);

  const loadLinkedAccounts = useCallback(async (rootId, compId, gid) => {
    if (!rootId || !hasScope(compId, gid)) {
      setLinkedAccounts([]);
      linkedAccountsRef.current = [];
      setLinkedAccountCurrenciesMap(new Map());
      linkedCcyMapRef.current = new Map();
      setLinkedCurrenciesLoaded(true);
      linkedCcyLoadedRef.current = true;
      return [];
    }
    try {
      const params = new URLSearchParams({
        action: "get_all_linked_accounts",
        account_id: String(rootId),
        ...scopeQueryFields(compId, gid),
      });
      const res = await fetch(buildApiUrl(`api/accounts/account_link_api.php?${params}`), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await parseJsonResponse(await res.text());
      const list = json?.success ? mapLinkedAccountsApiList(json.data) : [];
      setLinkedAccounts(list);
      linkedAccountsRef.current = list;

      const ids = list.map((a) => Number(a.id)).filter(Boolean);
      if (!ids.length) {
        setLinkedAccountCurrenciesMap(new Map());
        linkedCcyMapRef.current = new Map();
        setLinkedCurrenciesLoaded(true);
        linkedCcyLoadedRef.current = true;
        return list;
      }
      setLinkedCurrenciesLoaded(false);
      linkedCcyLoadedRef.current = false;
      try {
        const qs = new URLSearchParams({
          action: "get_batch_account_currencies",
          account_ids: ids.join(","),
          ...scopeQueryFields(compId, gid),
          _t: String(Date.now()),
        });
        const cRes = await fetch(buildApiUrl(`api/accounts/account_currency_api.php?${qs}`), {
          credentials: "include",
          cache: "no-store",
        });
        const cJson = await parseJsonResponse(await cRes.text());
        const map =
          cJson?.success && Array.isArray(cJson.data) ? mapBatchAccountCurrencies(cJson.data) : new Map();
        setLinkedAccountCurrenciesMap(map);
        linkedCcyMapRef.current = map;
      } catch {
        setLinkedAccountCurrenciesMap(new Map());
        linkedCcyMapRef.current = new Map();
      } finally {
        setLinkedCurrenciesLoaded(true);
        linkedCcyLoadedRef.current = true;
      }
      return list;
    } catch {
      setLinkedAccounts([]);
      linkedAccountsRef.current = [];
      setLinkedAccountCurrenciesMap(new Map());
      linkedCcyMapRef.current = new Map();
      setLinkedCurrenciesLoaded(true);
      linkedCcyLoadedRef.current = true;
      return [];
    }
  }, []);

  const commitTableDisplayContext = useCallback((useAll, useSelected, history, currencyOrderHint = []) => {
    const fromHistory = [
      ...new Set(
        (Array.isArray(history) ? history : [])
          .map((row) => String(row?.currency || "").trim())
          .filter(Boolean),
      ),
    ];
    const currencyOrder = useAll
      ? currencyOrderHint.length
        ? currencyOrderHint
        : fromHistory
      : [...useSelected];
    setTableDisplayContext({
      isAllSelected: useAll,
      selectedCurrencies: [...useSelected],
      currencyOrder,
    });
  }, []);

  const refreshBalances = useCallback(
    async ({
      accounts,
      compId = companyId,
      gid = groupId,
      fromYmd = dateFromYmd,
      toYmd = dateToYmd,
      useAll = isAllSelected,
      useSelected = selectedCurrencies,
      currencyCodes = availableCurrencies,
      silent = false,
    } = {}) => {
      const orderUpper = getMemberMiniGridCurrencies(currencyCodes, useAll, useSelected);
      const list = (accounts ?? linkedAccountsRef.current ?? []).filter((a) => Number(a?.id) > 0);

      balancesSeqRef.current += 1;
      const seq = balancesSeqRef.current;
      balancesAbortRef.current?.abort();
      const ac = new AbortController();
      balancesAbortRef.current = ac;

      if (!list.length || !orderUpper.length || !hasScope(compId, gid)) {
        setBalanceMap(new Map());
        setBalanceTotals(new Map());
        setBalanceCurrencies(orderUpper);
        setBalancesLoading(false);
        return;
      }

      if (!silent) setBalancesLoading(true);
      setBalanceCurrencies(orderUpper);

      const ccyMap = linkedCcyMapRef.current;
      const ccyLoaded = linkedCcyLoadedRef.current;

      try {
        const pairs = [];
        for (const acc of list) {
          const id = Number(acc.id);
          for (const cu of orderUpper) {
            if (!accountHoldsMiniGridCurrency(ccyMap, ccyLoaded, id, cu)) continue;
            pairs.push({ id, cu });
          }
        }

        const results = await Promise.all(
          pairs.map(async ({ id, cu }) => {
            try {
              const dec = await fetchAccountHistoryClosingBalance(
                id,
                cu,
                fromYmd,
                toYmd,
                compId,
                gid,
                ac.signal,
              );
              return { key: `${id}|${cu}`, dec };
            } catch (e) {
              if (e?.name === "AbortError") throw e;
              return { key: `${id}|${cu}`, dec: null };
            }
          }),
        );
        if (seq !== balancesSeqRef.current) return;
        const nextMap = new Map();
        for (const row of results) {
          if (row?.dec != null) nextMap.set(row.key, row.dec);
        }
        setBalanceMap(nextMap);
        setBalanceTotals(computeMiniGridTotals(nextMap, orderUpper, list, ccyMap, ccyLoaded));
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== balancesSeqRef.current) return;
        setBalanceMap(new Map());
        setBalanceTotals(new Map());
      } finally {
        if (seq === balancesSeqRef.current) setBalancesLoading(false);
      }
    },
    [
      companyId,
      groupId,
      dateFromYmd,
      dateToYmd,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
    ],
  );

  const fetchHistory = useCallback(
    async ({
      viewId = viewAccountId,
      compId = companyId,
      gid = groupId,
      fromYmd = dateFromYmd,
      toYmd = dateToYmd,
      useAll = isAllSelected,
      useSelected = selectedCurrencies,
      currencyCodes = availableCurrencies,
      silent = false,
    } = {}) => {
      const dateFrom = ymdToDmy(fromYmd);
      const dateTo = ymdToDmy(toYmd);
      if (!viewId || !hasScope(compId, gid) || !dateFrom || !dateTo) return;

      searchSeqRef.current += 1;
      const seq = searchSeqRef.current;
      historyAbortRef.current?.abort();
      const ac = new AbortController();
      historyAbortRef.current = ac;

      if (!silent) setLoadingTable(true);

      if (!useAll && !(useSelected?.length)) {
        setHistoryRows([]);
        commitTableDisplayContext(false, [], [], currencyCodes);
        setBalanceMap(new Map());
        setBalanceTotals(new Map());
        setBalanceCurrencies([]);
        if (seq === searchSeqRef.current) setLoadingTable(false);
        return;
      }

      const targetCurrencies = useAll ? currencyCodes : [...useSelected];

      try {
        let history = [];
        if (!targetCurrencies.length || targetCurrencies.length === 1) {
          const params = new URLSearchParams({
            account_id: String(viewId),
            date_from: dateFrom,
            date_to: dateTo,
            ...scopeQueryFields(compId, gid),
            member_view: "1",
          });
          if (targetCurrencies[0]) params.append("currency", targetCurrencies[0]);
          const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
            credentials: "include",
            cache: "no-store",
            signal: ac.signal,
          });
          const json = await parseJsonResponse(await res.text());
          if (seq !== searchSeqRef.current) return;
          if (!json?.success) throw new Error(json?.error || t("queryFailed"));
          history = Array.isArray(json.data?.history) ? json.data.history : [];
        } else {
          const histories = await Promise.all(
            targetCurrencies.map(async (cu) => {
              const params = new URLSearchParams({
                account_id: String(viewId),
                date_from: dateFrom,
                date_to: dateTo,
                ...scopeQueryFields(compId, gid),
                currency: String(cu || "").trim().toUpperCase(),
                member_view: "1",
              });
              const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
                credentials: "include",
                cache: "no-store",
                signal: ac.signal,
              });
              const json = await parseJsonResponse(await res.text());
              if (!json?.success) throw new Error(json?.error || t("queryFailed"));
              return Array.isArray(json.data?.history) ? json.data.history : [];
            }),
          );
          if (seq !== searchSeqRef.current) return;
          history = histories.flat();
        }
        setHistoryRows(history);
        commitTableDisplayContext(useAll, useSelected, history, currencyCodes);
        if (!silent) notify(t("queryCompleted"));
        void refreshBalances({
          compId,
          gid,
          fromYmd,
          toYmd,
          useAll,
          useSelected,
          currencyCodes,
          silent: true,
        });
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setHistoryRows([]);
        commitTableDisplayContext(useAll, useSelected, [], currencyCodes);
        notify(translateMemberApiMessage(lang, e?.message, "couldNotLoadHistory"), "error");
      } finally {
        if (seq === searchSeqRef.current) setLoadingTable(false);
      }
    },
    [
      viewAccountId,
      companyId,
      groupId,
      dateFromYmd,
      dateToYmd,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
      commitTableDisplayContext,
      refreshBalances,
      notify,
      lang,
      t,
    ],
  );

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { res, json } = await fetchJson(buildApiUrl("api/session/current_user_api.php"), {
          signal: ac.signal,
        });
        if (!res.ok || !json?.success || !json?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = json.data;
        if (String(u.user_type || "").toLowerCase() !== "member") {
          navigate("/dashboard", { replace: true });
          return;
        }
        const loginId = Number(u.member_login_account_id || u.user_id) || 0;
        const viewId = Number(u.member_winloss_view_account_id || u.winloss_view_account_id || u.user_id) || 0;
        const gid =
          String(u?.login_scope || "").toLowerCase() === "group"
            ? String(u?.login_identifier || "").trim().toUpperCase()
            : "";
        const cid = Number(u.company_id) || 0;
        setMe(u);
        setLoginRootAccountId(loginId);
        setViewAccountId(viewId);
        setCompanyId(cid);
        setGroupId(gid);

        const cRes = await fetch(
          buildApiUrl(`api/accounts/account_company_api.php?action=get_account_companies&account_id=${loginId}`),
          { credentials: "include", signal: ac.signal },
        );
        const cJson = await parseJsonResponse(await cRes.text());
        if (!ac.signal.aborted) {
          setCompanies(Array.isArray(cJson?.data) ? cJson.data : []);
        }

        await loadLinkedAccounts(loginId, cid, gid);
        const codes = await loadOwnedCurrencies(viewId, cid, gid);
        if (ac.signal.aborted) return;
        setBootLoading(false);
        await fetchHistory({
          viewId,
          compId: cid,
          gid,
          currencyCodes: codes,
          silent: true,
        });
      } catch (e) {
        if (e?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setBootLoading(false);
      }
    })();
    return () => {
      ac.abort();
      historyAbortRef.current?.abort();
      balancesAbortRef.current?.abort();
      clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const switchCompany = useCallback(
    async (nextCompanyId, companyLabel) => {
      if (!nextCompanyId || Number(nextCompanyId) === Number(companyId)) return;
      try {
        const res = await fetch(
          buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`),
          { credentials: "include" },
        );
        const json = await parseJsonResponse(await res.text());
        if (!json?.success) throw new Error(json?.error || t("failedSwitchCompany"));
        const cid = Number(nextCompanyId);
        setCompanyId(cid);
        setGroupId("");
        notify(t("switchedToCompany", { label: companyLabel || nextCompanyId }));
        await loadLinkedAccounts(loginRootAccountId, cid, "");
        const codes = await loadOwnedCurrencies(viewAccountId, cid, "");
        await fetchHistory({
          compId: cid,
          gid: "",
          currencyCodes: codes,
        });
      } catch (e) {
        notify(translateMemberApiMessage(lang, e?.message, "failedSwitchCompany"), "error");
      }
    },
    [companyId, loginRootAccountId, viewAccountId, loadLinkedAccounts, loadOwnedCurrencies, fetchHistory, notify, lang, t],
  );

  const switchAccount = useCallback(
    async (nextAccountId, code, name) => {
      if (!nextAccountId || Number(nextAccountId) === Number(viewAccountId)) return;
      try {
        const res = await fetch(
          buildApiUrl(`api/session/update_account_session_api.php?account_id=${nextAccountId}`),
          { credentials: "include" },
        );
        const json = await parseJsonResponse(await res.text());
        if (!json?.success) throw new Error(json?.message || t("switchFailed"));
        const payload = json.data || json;
        const newId = Number(payload.account_id) || Number(nextAccountId);
        setViewAccountId(newId);
        notify(t("switchedToAccount", { label: payload.account_code || code || name || newId }));
        const codes = await loadOwnedCurrencies(newId, companyId, groupId);
        await fetchHistory({
          viewId: newId,
          currencyCodes: codes,
        });
      } catch (e) {
        notify(translateMemberApiMessage(lang, e?.message, "failedSwitchAccount"), "error");
      }
    },
    [viewAccountId, companyId, groupId, loadOwnedCurrencies, fetchHistory, notify, lang, t],
  );

  const setCurrencyAll = useCallback(() => {
    const next = applyCurrencyAllToggle();
    setIsAllSelected(next.isAllSelected);
    setSelectedCurrencies(next.selectedCurrencies);
  }, []);

  const toggleCurrency = useCallback(
    (code) => {
      const next = applyCurrencyToggle(availableCurrencies, isAllSelected, selectedCurrencies, code);
      setIsAllSelected(next.isAllSelected);
      setSelectedCurrencies(next.selectedCurrencies);
    },
    [availableCurrencies, isAllSelected, selectedCurrencies],
  );

  const applyFilters = useCallback(
    async ({ fromYmd, toYmd, useAll, useSelected } = {}) => {
      const nextFrom = fromYmd ?? dateFromYmd;
      const nextTo = toYmd ?? dateToYmd;
      const nextAll = useAll ?? isAllSelected;
      const nextSel = useSelected ?? selectedCurrencies;
      setDateFromYmd(nextFrom);
      setDateToYmd(nextTo);
      setIsAllSelected(nextAll);
      setSelectedCurrencies(nextSel);
      await fetchHistory({
        fromYmd: nextFrom,
        toYmd: nextTo,
        useAll: nextAll,
        useSelected: nextSel,
      });
    },
    [dateFromYmd, dateToYmd, isAllSelected, selectedCurrencies, fetchHistory],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchHistory({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchHistory]);

  const viewAccount = useMemo(() => {
    const hit = linkedAccounts.find((a) => Number(a.id) === Number(viewAccountId));
    return hit || { id: viewAccountId, account_id: "", name: "" };
  }, [linkedAccounts, viewAccountId]);

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const displayGroupId = String(me?.login_group_id || me?.login_identifier || groupId || "").toUpperCase();

  return {
    i18n,
    t,
    lang,
    setLang,
    me,
    bootLoading,
    companies,
    companyId,
    groupId,
    loginRootAccountId,
    viewAccountId,
    viewAccount,
    linkedAccounts,
    dateFromYmd,
    dateToYmd,
    setDateFromYmd,
    setDateToYmd,
    availableCurrencies,
    isAllSelected,
    selectedCurrencies,
    setCurrencyAll,
    toggleCurrency,
    groupedRows,
    loadingTable,
    toast,
    refreshing,
    balanceMap,
    balanceTotals,
    balanceCurrencies,
    balancesLoading,
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    companyCode,
    groupIdLabel: displayGroupId,
    logout,
    refresh,
    switchCompany,
    switchAccount,
    applyFilters,
    notify,
  };
}
