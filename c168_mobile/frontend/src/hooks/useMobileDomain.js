import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  canAccessC168DomainPages,
  domainApi,
  ensureC168DomainApiSession,
  fetchOwnerCompaniesForDomain,
} from "../lib/c168DomainAccess.js";
import { fetchJson } from "../lib/fetchJson.js";
import { hasProtectedCompany, normalizeDomainFeeSettingsFromApi } from "../lib/domainHelpers.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { domainText, getDomainText } from "../translateFile/domainTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";

export function useMobileDomain() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => domainText(lang), [lang]);
  const t = useCallback((key, params) => getDomainText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [domains, setDomains] = useState([]);
  const [domainPeriodPrices, setDomainPeriodPrices] = useState(null);
  const [search, setSearch] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const meRef = useRef(null);
  const companiesRef = useRef([]);
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

  const refreshFeeSummary = useCallback(async () => {
    try {
      const { json } = await domainApi({ action: "get_domain_fee_settings" });
      if (json?.success && json.data) {
        setDomainPeriodPrices(normalizeDomainFeeSettingsFromApi(json.data));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadDomains = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const synced = await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        if (!synced) {
          if (!silent) setError(t("failedToLoadDomainData"));
          return false;
        }
        const { res, json } = await domainApi({ action: "list" });
        if (!res.ok || !json?.success) {
          if (!silent) setError(json?.message || t("failedToLoadDomainData"));
          return false;
        }
        if (!silent) setError("");
        setDomains(Array.isArray(json?.data?.domains) ? json.data.domains : []);
        void refreshFeeSummary();
        return true;
      } catch {
        if (!silent) setError(t("failedToLoadDomainData"));
        return false;
      }
    },
    [refreshFeeSummary, t],
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

        if (!canAccessC168DomainPages(user)) {
          setBlocked(true);
          navigate("/more", { replace: true });
          return;
        }
        const synced = await ensureC168DomainApiSession(user, ownerCompanies);
        if (!synced) {
          setError(t("failedToLoadDomainData"));
          setLoading(false);
          return;
        }
        await loadDomains();
      } catch (e) {
        if (e?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      ac.abort();
      clearTimeout(toastTimer.current);
    };
  }, [navigate, loadDomains, t]);

  useRealtimeDomain(
    REALTIME_DOMAINS.DOMAIN,
    () => {
      void loadDomains({ silent: true });
    },
    { enabled: Boolean(me) && !blocked },
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDomains({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadDomains]);

  const filteredDomains = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return domains;
    return domains.filter((d) => {
      const comps = Array.isArray(d.companies_full) ? d.companies_full : [];
      const compStr = comps.map((c) => String(c.company_id || "").toLowerCase()).join(" ");
      return (
        String(d.owner_code || "").toLowerCase().includes(term) ||
        String(d.name || "").toLowerCase().includes(term) ||
        String(d.email || "").toLowerCase().includes(term) ||
        String(d.group_ids || "").toLowerCase().includes(term) ||
        compStr.includes(term)
      );
    });
  }, [domains, search]);

  const toggleChecked = useCallback((id, checked) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setCheckedIds(new Set());
    setSelectMode(false);
  }, []);

  const prepareBulkDelete = useCallback(() => {
    if (checkedIds.size === 0) {
      notify(t("selectOwnersToDeleteFirst"), "error");
      return null;
    }
    const selected = domains.filter((d) => checkedIds.has(d.id));
    const withCompanies = selected.filter((d) => {
      const comps = Array.isArray(d.companies_full) ? d.companies_full : [];
      return comps.length > 0;
    });
    const valid = selected.filter((d) => {
      const comps = Array.isArray(d.companies_full) ? d.companies_full : [];
      return comps.length === 0;
    });

    if (withCompanies.length > 0 && valid.length === 0) {
      notify(t("cannotDeleteOwnersWithCompanies"), "error");
      return null;
    }
    if (withCompanies.length > 0 && valid.length > 0) {
      notify(t("ownersWithCompaniesSkippedWillDelete", { count: valid.length }), "error");
    }
    if (valid.length === 0) return null;

    const names = valid.map((d) => d.name).join(", ");
    return {
      valid,
      message: t("confirmDeleteOwners", { count: valid.length, names }),
    };
  }, [checkedIds, domains, notify, t]);

  const executeBulkDelete = useCallback(
    async (validOwners) => {
      const valid = Array.isArray(validOwners) ? validOwners : [];
      if (valid.length === 0) return false;
      try {
        const results = await Promise.all(
          valid.map((d) => domainApi({ action: "delete", id: d.id }).then(({ json }) => json)),
        );
        const ok = results.filter((r) => r?.success).length;
        const fail = results.length - ok;
        if (fail === 0) notify(t("deletedOwnersSuccess", { ok }));
        else notify(t("deletionCompleted", { ok, fail }), "error");
        const deletedIds = new Set(valid.filter((_, i) => results[i]?.success).map((d) => d.id));
        if (deletedIds.size > 0) {
          setDomains((prev) => prev.filter((d) => !deletedIds.has(d.id)));
        }
        clearSelection();
        return true;
      } catch {
        notify(t("batchDeleteError"), "error");
        return false;
      }
    },
    [clearSelection, notify, t],
  );

  const handleDomainSaved = useCallback(
    (data) => {
      if (!data?.id) {
        void loadDomains({ silent: true });
        return;
      }
      setDomains((prev) => {
        const exists = prev.some((d) => d.id === data.id);
        if (exists) return prev.map((d) => (d.id === data.id ? data : d));
        return [...prev, data];
      });
    },
    [loadDomains],
  );

  const isOwnerOrAdmin = ["owner", "admin"].includes(String(me?.role || "").toLowerCase());
  const isDeletable = useCallback((domain) => {
    const companiesFull = Array.isArray(domain?.companies_full) ? domain.companies_full : [];
    return !hasProtectedCompany(companiesFull);
  }, []);

  return {
    lang,
    setLang,
    i18n,
    t,
    me,
    companies,
    domains,
    filteredDomains,
    domainPeriodPrices,
    setDomainPeriodPrices,
    search,
    setSearch,
    selectMode,
    setSelectMode,
    checkedIds,
    toggleChecked,
    clearSelection,
    prepareBulkDelete,
    executeBulkDelete,
    loading,
    refreshing,
    refresh,
    blocked,
    error,
    toast,
    notify,
    logout,
    loadDomains,
    handleDomainSaved,
    isOwnerOrAdmin,
    isDeletable,
    companyCode: "C168",
    groupId: "",
  };
}
