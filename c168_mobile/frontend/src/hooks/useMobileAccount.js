import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  companiesForPicker,
  pickCompany,
  resolveCompanyPickForGroup,
  resolveInitialMobileGcScope,
  resolveMobileGroupIds,
} from "../lib/dashboardScope.js";
import { fetchJson, assertApiOk } from "../lib/fetchJson.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { canUseGroupOnlyMode, filterCompaniesForUserScope } from "../lib/loginScope.js";
import {
  accountScopeIsGroupOnly,
  accountScopePayload,
  accountScopeQuery,
  groupIdsForGroupsAllAggregate,
  mutationScopePayload,
  normalizeAccountLedgerScope,
  resolveAccountScopeDraft,
} from "../lib/mobileAccountScope.js";
import { isPartnershipAuditReadOnlyLocked } from "../lib/partnershipAuditReadOnly.js";
import {
  buildMobileRealtimeScopeFromGc,
  setMobileRealtimeScope,
} from "../lib/realtime/mobileRealtimeScope.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { accountText } from "../translateFile/accountTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import { canAccessAccount, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const COMPANIES_API = "api/transactions/get_owner_companies_api.php";

function intersectAccountIdSets(sets) {
  if (!Array.isArray(sets) || sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  const out = new Set([...(first || [])].map(Number).filter((id) => id > 0));
  for (const set of rest) {
    const next = new Set([...(set || [])].map(Number));
    for (const id of [...out]) {
      if (!next.has(id)) out.delete(id);
    }
  }
  return out;
}
const EMPTY_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  status: "active",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function mergeRows(lists) {
  const byId = new Map();
  lists.flat().forEach((row) => {
    const id = Number(row?.id);
    if (id > 0) byId.set(id, row);
  });
  return [...byId.values()];
}

function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("-") ? raw : `-${raw}`;
}

async function readJson(url, options = {}) {
  const { res, json } = await fetchJson(url, options);
  assertApiOk(res, json);
  return json;
}

export function useMobileAccount() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => accountText(lang), [lang]);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState("account");
  const [sortDirection, setSortDirection] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formCurrencies, setFormCurrencies] = useState([]);
  const [initialFormCurrencies, setInitialFormCurrencies] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  /** Edit-account ledger override (group ledger row under company page filter). */
  const [modalLedgerScope, setModalLedgerScope] = useState(null);
  const [linkPool, setLinkPool] = useState([]);
  const [linkedIds, setLinkedIds] = useState(new Set());
  const [linkTypeMap, setLinkTypeMap] = useState({});
  const [linkCompanyId, setLinkCompanyId] = useState(null);
  const [linkType, setLinkType] = useState("bidirectional");
  const [currencyLinked, setCurrencyLinked] = useState(new Set());
  const [currencyInitial, setCurrencyInitial] = useState(new Set());
  const [settingCurrencyIds, setSettingCurrencyIds] = useState(() => new Set());
  const [settingInitialByCurrency, setSettingInitialByCurrency] = useState(() => new Map());
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);
  const listSeq = useRef(0);
  const softReloadRef = useRef(false);

  const scope = useMemo(
    () => ({ companyId, selectedGroup, groupsAllMode, groupAllMode }),
    [companyId, selectedGroup, groupsAllMode, groupAllMode],
  );
  const groupIds = useMemo(() => resolveMobileGroupIds(companies, me), [companies, me]);
  const selectedCompany = useMemo(
    () => companies.find((row) => Number(row.id) === Number(companyId)) || null,
    [companies, companyId],
  );
  const groupOnlyMode = accountScopeIsGroupOnly(scope);
  const mutationsBlocked = isPartnershipAuditReadOnlyLocked(me);
  const canMutate =
    !mutationsBlocked &&
    !groupsAllMode &&
    !groupAllMode &&
    (Number(companyId) > 0 || groupOnlyMode);

  const notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const { res: meRes, json: meJson } = await fetchJson(
          buildApiUrl("api/session/current_user_api.php"),
          {
            signal: ac.signal,
          },
        );
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
        if (!canAccessAccount(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);
        const companiesJson = await readJson(buildApiUrl(`${COMPANIES_API}?all=1`), {
          signal: ac.signal,
        });
        const list = Array.isArray(companiesJson.data) ? companiesJson.data : [];
        const scoped = filterCompaniesForUserScope(list, user);
        const picked = pickCompany(scoped, user.company_id);
        const initial = resolveInitialMobileGcScope(user, scoped, picked);
        setCompanies(scoped);
        setCompanyId(initial.companyId);
        setSelectedGroup(initial.selectedGroup);
      } catch (e) {
        if (e?.name !== "AbortError") setError(e?.message || i18n.loadError);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate, i18n.loadError]);

  const fetchRows = useCallback(
    async (signal) => {
      const filters = { search: debouncedSearch, showInactive };
      // Groups All → per-group ledger URLs (desktop fetchMergedAccounts groupIds).
      if (groupsAllMode) {
        const gids = groupIdsForGroupsAllAggregate(companies, groupIds);
        if (!gids.length) return [];
        const lists = await Promise.all(
          gids.map(async (gid) => {
            const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
            accountScopeQuery(
              {
                companyId: null,
                selectedGroup: gid,
                groupsAllMode: false,
                groupAllMode: false,
              },
              filters,
            ).forEach((value, key) => url.searchParams.set(key, value));
            const json = await readJson(url.toString(), { signal });
            return Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
          }),
        );
        return mergeRows(lists);
      }
      let targets = [scope];
      if (groupAllMode) {
        const rows = companies.filter((row) => {
          if (!(Number(row?.id) > 0)) return false;
          return upper(row?.group_id) === upper(selectedGroup);
        });
        targets = rows.map((row) => ({
          companyId: Number(row.id),
          selectedGroup: selectedGroup,
          groupsAllMode: false,
          groupAllMode: false,
        }));
      }
      if (!targets.length) return [];
      const lists = await Promise.all(
        targets.map(async (target) => {
          const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
          accountScopeQuery(target, filters).forEach((value, key) => url.searchParams.set(key, value));
          const json = await readJson(url.toString(), { signal });
          return Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        }),
      );
      return mergeRows(lists);
    },
    [
      companies,
      debouncedSearch,
      groupAllMode,
      groupIds,
      groupsAllMode,
      scope,
      selectedGroup,
      showInactive,
    ],
  );

  useEffect(() => {
    if (!me || (!Number(companyId) && !groupOnlyMode && !groupsAllMode && !groupAllMode)) return;
    const seq = ++listSeq.current;
    const soft = softReloadRef.current;
    softReloadRef.current = false;
    const ac = new AbortController();
    if (!soft) setLoading(true);
    setError("");
    fetchRows(ac.signal)
      .then((rows) => {
        if (seq === listSeq.current) setAccounts(rows);
      })
      .catch((e) => {
        if (e?.name !== "AbortError" && seq === listSeq.current && !soft) {
          setError(e?.message || i18n.loadError);
        }
      })
      .finally(() => {
        if (seq === listSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => ac.abort();
  }, [companyId, fetchRows, groupAllMode, groupOnlyMode, groupsAllMode, i18n.loadError, me, reloadNonce]);

  // Publish GC scope for MobileRealtimeBridge SSE ticket.
  useEffect(() => {
    if (!me) return;
    setMobileRealtimeScope(
      buildMobileRealtimeScopeFromGc({
        companyId,
        selectedGroup,
        groupsAllMode,
        groupAllMode,
      }),
    );
  }, [me, companyId, selectedGroup, groupsAllMode, groupAllMode]);

  const accountRealtimeEnabled =
    Number.isFinite(Number(companyId)) && Number(companyId) > 0
      ? true
      : Boolean(selectedGroup || groupsAllMode || groupAllMode);

  useRealtimeDomain(
    REALTIME_DOMAINS.ACCOUNTS,
    () => {
      softReloadRef.current = true;
      setReloadNonce((value) => value + 1);
    },
    { enabled: accountRealtimeEnabled },
  );

  const displayAccounts = useMemo(() => {
    const rows = [...accounts];
    const direction = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let left = a?.account_id;
      let right = b?.account_id;
      if (sortKey === "name") {
        left = a?.name;
        right = b?.name;
      } else if (sortKey === "role") {
        left = a?.role;
        right = b?.role;
      } else if (sortKey === "lastLogin") {
        left = a?.last_login;
        right = b?.last_login;
      }
      return String(left || "").localeCompare(String(right || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    });
    return rows;
  }, [accounts, sortDirection, sortKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadNonce((value) => value + 1);
  }, []);

  const applyScope = useCallback(
    async (draft) => {
      const next = resolveAccountScopeDraft(draft, companies);
      if (next.companyId && Number(next.companyId) !== Number(companyId)) {
        try {
          await readJson(
            buildApiUrl(`api/session/update_company_session_api.php?company_id=${next.companyId}`),
          );
        } catch (e) {
          notify(e?.message || i18n.loadError, "error");
          return false;
        }
      }
      setCompanyId(next.companyId);
      setSelectedGroup(next.selectedGroup);
      setGroupsAllMode(next.groupsAllMode);
      setGroupAllMode(next.groupAllMode);
      return true;
    },
    [companies, companyId, i18n.loadError, notify],
  );

  const activeMutationPayload = useCallback(
    () => mutationScopePayload(scope, modalLedgerScope),
    [scope, modalLedgerScope],
  );

  const scopeFormData = useCallback(
    (fd) => {
      Object.entries(activeMutationPayload()).forEach(([key, value]) => fd.set(key, value));
      return fd;
    },
    [activeMutationPayload],
  );

  const guarded = useCallback(
    (fn) => {
      if (!canMutate) {
        notify(i18n.readOnly, "error");
        return false;
      }
      fn();
      return true;
    },
    [canMutate, i18n.readOnly, notify],
  );

  const toggleField = useCallback(
    async (account, endpoint, responseField, localField) => {
      if (!guarded(() => {})) return;
      try {
        const fd = scopeFormData(new FormData());
        fd.set("id", String(account.id));
        const json = await readJson(buildApiUrl(endpoint), { method: "POST", body: fd });
        const next = json?.data?.[responseField] ?? json?.[responseField];
        setAccounts((rows) =>
          rows.map((row) => (Number(row.id) === Number(account.id) ? { ...row, [localField]: next } : row)),
        );
        setDetail((row) =>
          Number(row?.id) === Number(account.id) ? { ...row, [localField]: next } : row,
        );
        if (localField === "status") setReloadNonce((value) => value + 1);
      } catch (e) {
        notify(e?.message || i18n.toggleError, "error");
      }
    },
    [guarded, i18n.toggleError, notify, scopeFormData],
  );

  const toggleStatus = useCallback(
    (account) =>
      toggleField(account, "api/accounts/toggle_account_status_api.php", "newStatus", "status"),
    [toggleField],
  );
  const toggleAlert = useCallback(
    async (accountRow) => {
      if (!guarded(() => {})) return "blocked";
      const currentlyOn = Number(accountRow?.payment_alert) === 1;
      if (!currentlyOn) {
        const type = accountRow?.alert_type || accountRow?.alert_day || "";
        const start = accountRow?.alert_start_date || accountRow?.alert_specific_date || "";
        if (!String(type).trim() || !String(start).trim()) {
          notify(i18n.alertRequired, "error");
          return "needsEdit";
        }
      }
      await toggleField(
        accountRow,
        "api/accounts/toggle_payment_alert_api.php",
        "newPaymentAlert",
        "payment_alert",
      );
      return "ok";
    },
    [guarded, i18n.alertRequired, notify, toggleField],
  );

  const loadRolesAndCurrencies = useCallback(
    async (accountId = null, ledgerOverride = modalLedgerScope) => {
      const mutScope = mutationScopePayload(scope, ledgerOverride);
      const roleUrl = new URL(buildApiUrl("api/editdata/editdata_api.php"));
      const currencyUrl = new URL(buildApiUrl("api/accounts/account_currency_api.php"));
      currencyUrl.searchParams.set("action", "get_available_currencies");
      if (accountId) currencyUrl.searchParams.set("account_id", String(accountId));
      for (const url of [roleUrl, currencyUrl]) {
        const params = new URLSearchParams(url.search);
        Object.entries(mutScope).forEach(([key, value]) => params.set(key, value));
        url.search = params.toString();
      }
      const companyUrl = new URL(buildApiUrl("api/accounts/account_company_api.php"));
      companyUrl.searchParams.set("action", "get_available_companies");
      if (accountId) companyUrl.searchParams.set("account_id", String(accountId));
      Object.entries(mutScope).forEach(([key, value]) => companyUrl.searchParams.set(key, value));

      const [roleJson, currencyJson, companyJson] = await Promise.all([
        readJson(roleUrl.toString()),
        readJson(currencyUrl.toString()),
        groupOnlyMode
          ? Promise.resolve({ data: [] })
          : readJson(companyUrl.toString()).catch(() => ({ data: [] })),
      ]);
      setRoles(Array.isArray(roleJson?.data?.roles) ? roleJson.data.roles : []);
      const currencyRows = Array.isArray(currencyJson?.data) ? currencyJson.data : [];
      setCurrencies(currencyRows);
      const selected = currencyRows.filter((row) => row.is_linked).map((row) => Number(row.id));
      setFormCurrencies(selected.length ? selected : currencyRows.slice(0, 1).map((row) => Number(row.id)));
      setInitialFormCurrencies(selected);

      const companyRows = Array.isArray(companyJson?.data) ? companyJson.data : [];
      setAvailableCompanies(companyRows);
      const linked = companyRows.filter((row) => row.is_linked).map((row) => Number(row.id));
      if (linked.length) {
        setSelectedCompanyIds(linked);
      } else if (Number(companyId) > 0) {
        setSelectedCompanyIds([Number(companyId)]);
      } else {
        setSelectedCompanyIds([]);
      }
    },
    [companyId, groupOnlyMode, modalLedgerScope, scope],
  );

  const openCreate = useCallback(async () => {
    if (!guarded(() => {})) return false;
    setDetail(null);
    setModalLedgerScope(null);
    setForm({ ...EMPTY_FORM });
    try {
      await loadRolesAndCurrencies(null, null);
      return true;
    } catch (e) {
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [guarded, i18n.loadError, loadRolesAndCurrencies, notify]);

  const loadDetail = useCallback(
    async (account) => {
      try {
        const url = new URL(buildApiUrl("api/accounts/getaccount_api.php"));
        url.searchParams.set("id", String(account.id));
        Object.entries(accountScopePayload(scope)).forEach(([key, value]) =>
          url.searchParams.set(key, value),
        );
        const json = await readJson(url.toString());
        // Never keep or surface the stored password hash from getaccount_api.
        const row = { ...(json.data || {}) };
        delete row.password;
        setDetail(row);
        setModalLedgerScope(normalizeAccountLedgerScope(row.ledger_scope));
        return row;
      } catch (e) {
        notify(e?.message || i18n.detailError, "error");
        return null;
      }
    },
    [i18n.detailError, notify, scope],
  );

  const openEdit = useCallback(async (source) => {
    const target = source || detail;
    if (!target || !guarded(() => {})) return false;
    const row = await loadDetail(target);
    if (!row) return false;
    const ledger = normalizeAccountLedgerScope(row.ledger_scope);
    setModalLedgerScope(ledger);
    setForm({
      id: row.id,
      account_id: upper(row.account_id),
      name: upper(row.name),
      role: row.role || "",
      status: String(row.status || "active").toLowerCase(),
      password: "",
      remark: upper(row.remark),
      payment_alert: String(Number(row.payment_alert) ? "1" : "0"),
      alert_type: row.alert_type || row.alert_day || "",
      alert_start_date: row.alert_start_date || row.alert_specific_date || "",
      alert_amount: row.alert_amount || "",
    });
    try {
      await loadRolesAndCurrencies(row.id, ledger);
      return true;
    } catch (e) {
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [detail, guarded, i18n.loadError, loadDetail, loadRolesAndCurrencies, notify]);

  const syncAccountCurrencies = useCallback(
    async (accountId, before, after) => {
      const oldSet = new Set(before.map(Number));
      const nextSet = new Set(after.map(Number));
      const actions = [
        ...[...nextSet].filter((id) => !oldSet.has(id)).map((id) => ["add_currency", id]),
        ...[...oldSet].filter((id) => !nextSet.has(id)).map((id) => ["remove_currency", id]),
      ];
      const mutScope = activeMutationPayload();
      for (const [action, currencyId] of actions) {
        const url = new URL(buildApiUrl("api/accounts/account_currency_api.php"));
        url.searchParams.set("action", action);
        Object.entries(mutScope).forEach(([key, value]) => url.searchParams.set(key, value));
        await readJson(url.toString(), {
          method: "POST",
          body: JSON.stringify({ account_id: Number(accountId), currency_id: Number(currencyId) }),
        });
      }
    },
    [activeMutationPayload],
  );

  const saveAccount = useCallback(async () => {
    const editing = Number(form.id) > 0;
    if (!form.name.trim() || !form.role.trim() || (!editing && (!form.account_id.trim() || !form.password.trim()))) {
      notify(editing ? i18n.editRequiredFields : i18n.requiredFields, "error");
      return false;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      notify(i18n.alertRequired, "error");
      return false;
    }
    setSaving(true);
    try {
      const fd = scopeFormData(new FormData());
      Object.entries(form).forEach(([key, value]) => {
        let out = String(value ?? "");
        if (key === "alert_amount") out = normalizeAlertAmount(value);
        else if (key === "account_id" || key === "name" || key === "remark") out = upper(out);
        fd.set(key, out);
      });
      const ids = selectedCompanyIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (!groupOnlyMode && ids.length) {
        fd.set("company_ids", JSON.stringify(ids));
        fd.set("company_id", String(ids[0]));
      } else if (Number(companyId) > 0) {
        fd.set("company_id", String(companyId));
        fd.set("company_ids", JSON.stringify([Number(companyId)]));
      }
      const json = await readJson(
        buildApiUrl(editing ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php"),
        { method: "POST", body: fd },
      );
      const accountId = editing ? Number(form.id) : Number(json?.data?.id);
      if (accountId > 0) {
        await syncAccountCurrencies(
          accountId,
          editing ? initialFormCurrencies : [],
          formCurrencies,
        );
      }
      notify(i18n.saveSuccess);
      setReloadNonce((value) => value + 1);
      if (editing) await loadDetail({ id: accountId });
      return true;
    } catch (e) {
      notify(e?.message || i18n.saveError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    companyId,
    form,
    formCurrencies,
    groupOnlyMode,
    i18n,
    initialFormCurrencies,
    loadDetail,
    notify,
    scopeFormData,
    selectedCompanyIds,
    syncAccountCurrencies,
  ]);

  const loadLinks = useCallback(async () => {
    if (!detail || !guarded(() => {})) return false;
    try {
      const mutScope = activeMutationPayload();
      const listUrl = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
      const listParams = new URLSearchParams(mutScope);
      listParams.set("showAll", "1");
      listParams.forEach((value, key) => listUrl.searchParams.set(key, value));
      const linkedUrl = new URL(buildApiUrl("api/accounts/account_link_api.php"));
      linkedUrl.searchParams.set("action", "get_linked_accounts");
      linkedUrl.searchParams.set("account_id", String(detail.id));
      Object.entries(mutScope).forEach(([key, value]) =>
        linkedUrl.searchParams.set(key, value),
      );
      const [listJson, linkedJson] = await Promise.all([
        readJson(listUrl.toString()),
        readJson(linkedUrl.toString()),
      ]);
      setLinkPool(
        (listJson?.data?.accounts || []).filter((row) => Number(row.id) !== Number(detail.id)),
      );
      const types = linkedJson?.data?.link_types_map || {};
      setLinkTypeMap(types);
      setLinkCompanyId(Number(linkedJson?.data?.company_id) || Number(companyId) || null);
      setLinkedIds(
        new Set(
          (linkedJson?.data?.accounts || [])
            .filter((row) => types[row.id] === "bidirectional")
            .map((row) => Number(row.id)),
        ),
      );
      setLinkType("bidirectional");
      return true;
    } catch (e) {
      notify(e?.message || i18n.linkError, "error");
      return false;
    }
  }, [activeMutationPayload, companyId, detail, guarded, i18n.linkError, notify]);

  useEffect(() => {
    setLinkedIds(
      new Set(
        Object.entries(linkTypeMap)
          .filter(([, type]) => type === linkType)
          .map(([id]) => Number(id)),
      ),
    );
  }, [linkType, linkTypeMap]);

  const saveLinks = useCallback(async () => {
    if (!detail) return false;
    setSaving(true);
    try {
      const scopeData = activeMutationPayload();
      const current = new Set(
        Object.entries(linkTypeMap)
          .filter(([, type]) => type === linkType)
          .map(([id]) => Number(id)),
      );
      const add = [...linkedIds].filter((id) => !current.has(id));
      const remove = [...current].filter((id) => !linkedIds.has(id));
      const company = Number(linkCompanyId) || Number(companyId) || Number(selectedCompany?.id) || 0;
      for (const id of remove) {
        await readJson(buildApiUrl("api/accounts/account_link_api.php?action=unlink_accounts"), {
          method: "POST",
          body: JSON.stringify({
            account_id_1: Number(detail.id),
            account_id_2: id,
            company_id: company,
            ...scopeData,
          }),
        });
      }
      for (const id of add) {
        await readJson(buildApiUrl("api/accounts/account_link_api.php?action=link_accounts"), {
          method: "POST",
          body: JSON.stringify({
            account_id_1: Number(detail.id),
            account_id_2: id,
            company_id: company,
            ...scopeData,
            link_type: linkType,
            source_account_id: linkType === "unidirectional" ? Number(detail.id) : null,
          }),
        });
      }
      // Membership unchanged but link type may have changed (desktop update_link_type).
      if (!add.length && !remove.length && linkedIds.size > 0) {
        for (const id of linkedIds) {
          await readJson(
            buildApiUrl("api/accounts/account_link_api.php?action=update_link_type"),
            {
              method: "POST",
              body: JSON.stringify({
                account_id_1: Number(detail.id),
                account_id_2: id,
                company_id: company,
                ...scopeData,
                link_type: linkType,
                source_account_id: linkType === "unidirectional" ? Number(detail.id) : null,
              }),
            },
          );
        }
      }
      notify(i18n.linkSuccess);
      return true;
    } catch (e) {
      notify(e?.message || i18n.linkError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    activeMutationPayload,
    companyId,
    detail,
    i18n.linkError,
    i18n.linkSuccess,
    linkType,
    linkTypeMap,
    linkCompanyId,
    linkedIds,
    notify,
    selectedCompany?.id,
  ]);

  const deleteAccount = useCallback(async () => {
    if (!detail || !canMutate) return false;
    if (String(detail.status || "").toLowerCase() !== "inactive") return false;
    setSaving(true);
    try {
      const fd = scopeFormData(new FormData());
      fd.append("ids[]", String(detail.id));
      await readJson(buildApiUrl("api/accounts/delete_accounts_api.php"), {
        method: "POST",
        body: fd,
      });
      setDetail(null);
      setReloadNonce((value) => value + 1);
      notify(i18n.deleteSuccess);
      return true;
    } catch (e) {
      notify(e?.message || i18n.deleteError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [canMutate, detail, i18n.deleteError, i18n.deleteSuccess, notify, scopeFormData]);

  const settingCurrencyIdsKey = useMemo(
    () =>
      [...settingCurrencyIds]
        .map(Number)
        .filter((id) => id > 0)
        .sort((a, b) => a - b)
        .join(","),
    [settingCurrencyIds],
  );

  const loadCurrencyLinks = useCallback(
    async (currencyId) => {
      const url = new URL(buildApiUrl("api/accounts/bulk_account_currency_api.php"));
      url.searchParams.set("action", "get_linked_accounts_by_currency");
      url.searchParams.set("currency_id", String(currencyId));
      Object.entries(activeMutationPayload()).forEach(([key, value]) =>
        url.searchParams.set(key, value),
      );
      const json = await readJson(url.toString(), { method: "POST" });
      return (json?.data?.linked_account_ids || []).map(Number).filter((id) => id > 0);
    },
    [activeMutationPayload],
  );

  useEffect(() => {
    const currencyIds = settingCurrencyIdsKey
      ? settingCurrencyIdsKey.split(",").map(Number).filter((id) => id > 0)
      : [];
    if (!currencyIds.length) {
      setCurrencyLinked(new Set());
      setCurrencyInitial(new Set());
      setSettingInitialByCurrency(new Map());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          currencyIds.map(async (currencyId) => [currencyId, new Set(await loadCurrencyLinks(currencyId))]),
        );
        if (cancelled) return;
        const nextInitial = new Map(entries);
        const intersection = intersectAccountIdSets([...nextInitial.values()]);
        setSettingInitialByCurrency(nextInitial);
        setCurrencyInitial(intersection);
        setCurrencyLinked(intersection);
      } catch (e) {
        if (!cancelled) notify(e?.message || i18n.currencyError, "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.currencyError, loadCurrencyLinks, notify, settingCurrencyIdsKey]);

  const openCurrency = useCallback(async () => {
    if (!guarded(() => {})) return false;
    try {
      setSettingCurrencyIds(new Set());
      setCurrencyLinked(new Set());
      setCurrencyInitial(new Set());
      setSettingInitialByCurrency(new Map());
      await loadRolesAndCurrencies();
      return true;
    } catch (e) {
      notify(e?.message || i18n.currencyError, "error");
      return false;
    }
  }, [guarded, i18n.currencyError, loadRolesAndCurrencies, notify]);

  const createCurrency = useCallback(
    async (code) => {
      const normalized = upper(code);
      if (!normalized || !canMutate) return false;
      try {
        const json = await readJson(buildApiUrl("api/accounts/create_currency_api.php"), {
          method: "POST",
          body: JSON.stringify({ code: normalized, ...activeMutationPayload() }),
        });
        const newId = Number(json?.data?.id);
        if (!Number.isFinite(newId) || newId <= 0) {
          await loadRolesAndCurrencies();
          return true;
        }
        setCurrencies((rows) => [
          ...rows.filter((row) => Number(row.id) !== newId),
          { ...json.data, id: newId, is_linked: false },
        ]);
        return true;
      } catch (e) {
        notify(e?.message || i18n.currencyError, "error");
        return false;
      }
    },
    [activeMutationPayload, canMutate, i18n.currencyError, loadRolesAndCurrencies, notify],
  );

  const deleteCurrency = useCallback(
    async (currency) => {
      if (!currency?.id || !canMutate) return false;
      try {
        const mutScope = activeMutationPayload();
        const url = new URL(buildApiUrl("api/accounts/delete_currency_api.php"));
        Object.entries(mutScope).forEach(([key, value]) => url.searchParams.set(key, value));
        await readJson(url.toString(), {
          method: "POST",
          body: JSON.stringify({ id: Number(currency.id), ...mutScope }),
        });
        setCurrencies((rows) => rows.filter((row) => Number(row.id) !== Number(currency.id)));
        setSettingCurrencyIds((prev) => {
          const next = new Set(prev);
          next.delete(Number(currency.id));
          return next;
        });
        return true;
      } catch (e) {
        notify(e?.message || i18n.currencyError, "error");
        return false;
      }
    },
    [activeMutationPayload, canMutate, i18n.currencyError, notify],
  );

  const saveCurrencyLinks = useCallback(
    async () => {
      const currencyIds = [...settingCurrencyIds]
        .map(Number)
        .filter((id) => id > 0 && currencies.some((row) => Number(row.id) === id));
      if (!currencyIds.length) {
        notify(i18n.pleaseSelectCurrencyFirst, "error");
        return false;
      }
      const baseline = intersectAccountIdSets(
        currencyIds.map((currencyId) => settingInitialByCurrency.get(currencyId) || new Set()),
      );
      const toggledOn = [];
      const toggledOff = [];
      accounts.forEach((row) => {
        const id = Number(row.id);
        if (!(id > 0)) return;
        const was = baseline.has(id);
        const now = currencyLinked.has(id);
        if (now && !was) toggledOn.push(id);
        if (!now && was) toggledOff.push(id);
      });
      const updates = currencyIds
        .map((currencyId) => {
          const initial = settingInitialByCurrency.get(currencyId) || new Set();
          return {
            currencyId,
            linked: toggledOn.filter((id) => !initial.has(id)),
            unlinked: toggledOff.filter((id) => initial.has(id)),
          };
        })
        .filter((row) => row.linked.length > 0 || row.unlinked.length > 0);
      if (!updates.length) {
        notify(i18n.pleaseSelectAccountFirst, "error");
        return false;
      }
      setSaving(true);
      try {
        const url = new URL(buildApiUrl("api/accounts/bulk_account_currency_api.php"));
        url.searchParams.set("action", "bulk_update");
        Object.entries(activeMutationPayload()).forEach(([key, value]) =>
          url.searchParams.set(key, value),
        );
        for (const { currencyId, linked, unlinked } of updates) {
          await readJson(url.toString(), {
            method: "POST",
            body: JSON.stringify({
              currency_id: Number(currencyId),
              linked_account_ids: linked,
              unlinked_account_ids: unlinked,
            }),
          });
        }
        const nextInitial = new Map(settingInitialByCurrency);
        currencyIds.forEach((currencyId) => {
          const initial = new Set(nextInitial.get(currencyId) || []);
          (updates.find((row) => row.currencyId === currencyId)?.linked || []).forEach((id) =>
            initial.add(id),
          );
          (updates.find((row) => row.currencyId === currencyId)?.unlinked || []).forEach((id) =>
            initial.delete(id),
          );
          nextInitial.set(currencyId, initial);
        });
        const intersection = intersectAccountIdSets([...nextInitial.values()]);
        setSettingInitialByCurrency(nextInitial);
        setCurrencyInitial(intersection);
        setCurrencyLinked(intersection);
        notify(i18n.currencySuccess);
        return true;
      } catch (e) {
        notify(e?.message || i18n.currencyError, "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      accounts,
      activeMutationPayload,
      currencies,
      currencyLinked,
      i18n.currencyError,
      i18n.currencySuccess,
      i18n.pleaseSelectAccountFirst,
      i18n.pleaseSelectCurrencyFirst,
      notify,
      settingCurrencyIds,
      settingInitialByCurrency,
    ],
  );

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return {
    i18n,
    lang,
    setLang,
    me,
    companies,
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    selectedCompany,
    groupIds,
    companiesForPicker: companiesForPicker(companies, {
      selectedGroup,
      groupsAllMode,
      preferredCompanyId: companyId,
    }),
    canUseGroupOnlyForGroup: (group) => canUseGroupOnlyMode(me, group, companies),
    resolveCompanyForGroup: (group, current) =>
      resolveCompanyPickForGroup(companies, group, current),
    applyScope,
    accounts: displayAccounts,
    search,
    setSearch,
    showInactive,
    setShowInactive,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    loading,
    refreshing,
    error,
    blocked,
    toast,
    refresh,
    reload: refresh,
    mutationsBlocked,
    canMutate,
    detail,
    setDetail,
    loadDetail,
    toggleStatus,
    toggleAlert,
    form,
    setForm,
    roles,
    currencies,
    formCurrencies,
    setFormCurrencies,
    availableCompanies,
    selectedCompanyIds,
    setSelectedCompanyIds,
    groupOnlyMode,
    openCreate,
    openEdit,
    saveAccount,
    linkPool,
    linkedIds,
    setLinkedIds,
    linkType,
    setLinkType,
    loadLinks,
    saveLinks,
    deleteAccount,
    currencyLinked,
    setCurrencyLinked,
    settingCurrencyIds,
    setSettingCurrencyIds,
    currencyInitial,
    loadCurrencyLinks,
    openCurrency,
    createCurrency,
    deleteCurrency,
    saveCurrencyLinks,
    saving,
    logout,
    notify,
  };
}
