import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  approveAutoRenew,
  deleteAutoRenew,
  fetchAutoRenewApprovals,
  rejectAutoRenew,
} from "../lib/autoRenewApi.js";
import { rowMatchesSearch } from "../lib/autoRenewHelpers.js";
import {
  canAccessC168AutoRenew,
  ensureC168DomainApiSession,
  fetchOwnerCompaniesForDomain,
} from "../lib/c168DomainAccess.js";
import { normalizeDomainFeeSettingsFromApi } from "../lib/domainHelpers.js";
import { fetchJson } from "../lib/fetchJson.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { autoRenewText, getAutoRenewText } from "../translateFile/autoRenewTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";

const EMPTY_COUNTS = { pending: 0, approved: 0, rejected: 0, total: 0 };

export function useMobileAutoRenew() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => autoRenewText(lang), [lang]);
  const t = useCallback((key, params) => getAutoRenewText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [entityTab, setEntityTab] = useState("company");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [feeSettings, setFeeSettings] = useState(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [tabPendingCounts, setTabPendingCounts] = useState({ company: 0, group: 0 });
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const toastTimer = useRef(null);
  const meRef = useRef(null);
  const companiesRef = useRef([]);
  const fetchAbortRef = useRef(null);
  meRef.current = me;
  companiesRef.current = companies;

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const notify = useCallback((message, tone = "success") => {
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

  const loadList = useCallback(
    async ({ silent = false, entity = entityTab, status = statusFilter } = {}) => {
      fetchAbortRef.current?.abort();
      const ac = new AbortController();
      fetchAbortRef.current = ac;
      try {
        const synced = await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        if (!synced) {
          if (!silent) setError(t("accessDenied"));
          return false;
        }
        const data = await fetchAutoRenewApprovals(status, {
          entityType: entity,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return false;
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
        setFeeSettings(normalizeDomainFeeSettingsFromApi(data?.fee_settings));
        setCounts(data?.counts || EMPTY_COUNTS);
        setCanEdit(Boolean(data?.can_edit));
        const tpc = data?.tab_pending_counts;
        if (tpc) {
          setTabPendingCounts({
            company: Number(tpc.company) || 0,
            group: Number(tpc.group) || 0,
          });
        }
        if (!silent) setError("");
        return true;
      } catch (err) {
        if (err?.name === "AbortError") return false;
        if (!silent) {
          setError(t("loadFailed", { message: err?.message || "Unknown error" }));
          setRows([]);
        }
        return false;
      }
    },
    [entityTab, statusFilter, t],
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
        const user = json.data;
        setMe(user);
        const ownerCompanies = await fetchOwnerCompaniesForDomain(ac.signal);
        if (ac.signal.aborted) return;
        setCompanies(ownerCompanies);

        if (!canAccessC168AutoRenew(user)) {
          setBlocked(true);
          navigate("/more", { replace: true });
          return;
        }
        const synced = await ensureC168DomainApiSession(user, ownerCompanies);
        if (!synced) {
          setError(t("accessDenied"));
          setLoading(false);
          return;
        }
        await loadList();
      } catch (e) {
        if (e?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      ac.abort();
      fetchAbortRef.current?.abort();
      clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, t]);

  useEffect(() => {
    if (!me || blocked) return;
    void loadList({ silent: true });
  }, [entityTab, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Desktop parity: reload the list on ledger realtime events (AutoRenewPage useRealtimeDomain). */
  useRealtimeDomain(REALTIME_DOMAINS.LEDGER, () => {
    if (!me || blocked) return;
    void loadList({ silent: true });
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadList({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadList]);

  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesSearch(row, search)),
    [rows, search],
  );

  const approve = useCallback(
    async ({ requestId, period, fromAccountId, toAccountId }) => {
      setBusyId(requestId);
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        await approveAutoRenew({ requestId, period, fromAccountId, toAccountId });
        notify(t("approvedSuccess"));
        await loadList({ silent: true });
        return true;
      } catch (err) {
        notify(t("approveFailed", { message: err?.message || "Unknown error" }), "error");
        await loadList({ silent: true });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [loadList, notify, t],
  );

  const reject = useCallback(
    async ({ requestId }) => {
      setBusyId(requestId);
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        await rejectAutoRenew({ requestId });
        notify(t("rejectedSuccess"));
        await loadList({ silent: true });
        return true;
      } catch (err) {
        notify(t("rejectFailed", { message: err?.message || "Unknown error" }), "error");
        await loadList({ silent: true });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [loadList, notify, t],
  );

  const remove = useCallback(
    async (row) => {
      setBusyId(row.request_id);
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        await deleteAutoRenew({
          requestId: row.request_id,
          transactionId: row.transaction_id,
          entityType: row.entity_type,
        });
        notify(row.status === "rejected" ? t("revertedSuccess") : t("deletedSuccess"));
        await loadList({ silent: true });
        return true;
      } catch (err) {
        notify(t("deleteFailed", { message: err?.message || "Unknown error" }), "error");
        await loadList({ silent: true });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [loadList, notify, t],
  );

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const groupId = String(me?.login_group_id || me?.login_identifier || "").toUpperCase();

  return {
    i18n,
    t,
    lang,
    setLang,
    me,
    companyCode,
    groupId,
    entityTab,
    setEntityTab,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    rows: filteredRows,
    accounts,
    feeSettings,
    counts,
    tabPendingCounts,
    canEdit,
    loading,
    refreshing,
    blocked,
    error,
    toast,
    busyId,
    notify,
    logout,
    refresh,
    approve,
    reject,
    remove,
  };
}
