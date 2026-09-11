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
import { accountScopeIsGroupOnly, resolveAccountScopeDraft } from "../lib/mobileAccountScope.js";
import { isPartnershipAuditReadOnlyLocked } from "../lib/partnershipAuditReadOnly.js";
import {
  applyUserFilters,
  buildAccountPermissionPayload,
  buildAdminCompanyOptions,
  buildAdminGroupOptions,
  buildProcessPermissionPayload,
  canSelfEditAccountAccess,
  computeRowCapabilities,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  getFinalPermissionsForCreation,
  getRoleTemplateSidebarList,
  getUserEditFieldLocks,
  getVisiblePermissionKeys,
  normRole,
  parseAccessPermissionRaw,
  parseAssignableIds,
  parseJsonArray,
  partitionAccessRows,
  resolveAdminGroupCodes,
  resolveAdminGroupEntityIds,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  sortUsersByLogin,
  validateUserEmail,
} from "../lib/mobileUserAdmin.js";
import { adminText } from "../translateFile/adminTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import { canAccessAdmin, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const COMPANIES_API = "api/transactions/get_owner_companies_api.php";
const USERLIST_API = "api/users/userlist_api.php";

const EMPTY_FORM = {
  id: "",
  login_id: "",
  name: "",
  email: "",
  role: "",
  password: "",
  secondary_password: "",
  status: "active",
  read_only: true,
};

async function readJson(url, options = {}) {
  const { res, json } = await fetchJson(url, options);
  assertApiOk(res, json);
  return json;
}

async function postUserlist(body, signal) {
  const { res, json } = await fetchJson(buildApiUrl(USERLIST_API), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  assertApiOk(res, json);
  return json;
}

export function useMobileAdminUsers() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => adminText(lang), [lang]);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRow, setEditingRow] = useState(null);
  const [permSelected, setPermSelected] = useState(() => new Set());
  const [formAccounts, setFormAccounts] = useState([]);
  const [formProcesses, setFormProcesses] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(() => new Set());
  const [toggleableAccountIds, setToggleableAccountIds] = useState(null);
  const [toggleableProcessIds, setToggleableProcessIds] = useState(null);
  const [superiorClosedAccountIds, setSuperiorClosedAccountIds] = useState(() => new Set());
  const [superiorClosedProcessIds, setSuperiorClosedProcessIds] = useState(() => new Set());
  const [selectedTenantGroupIds, setSelectedTenantGroupIds] = useState(() => new Set());
  const [selectedTenantCompanyIds, setSelectedTenantCompanyIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);
  const listSeq = useRef(0);

  /** Dirty check: snapshot the freshly-seeded form; only a real user edit
      makes close ask "discard unsaved changes?". openCreate/openEdit arm the
      baseline AFTER their async seeds land (batched into one commit). */
  const [formBaseline, setFormBaseline] = useState("");
  const [baselinePending, setBaselinePending] = useState(false);
  const formSignature = useMemo(
    () =>
      JSON.stringify({
        f: form,
        p: [...permSelected].sort(),
        a: [...selectedAccountIds].sort((x, y) => x - y),
        pr: [...selectedProcessIds].sort((x, y) => x - y),
        tg: [...selectedTenantGroupIds].sort((x, y) => x - y),
        tc: [...selectedTenantCompanyIds].sort((x, y) => x - y),
      }),
    [
      form,
      permSelected,
      selectedAccountIds,
      selectedProcessIds,
      selectedTenantGroupIds,
      selectedTenantCompanyIds,
    ],
  );
  useEffect(() => {
    if (!baselinePending) return;
    setFormBaseline(formSignature);
    setBaselinePending(false);
  }, [baselinePending, formSignature]);
  const isFormDirty = !baselinePending && formBaseline !== formSignature;

  const scope = useMemo(
    () => ({ companyId, selectedGroup, groupsAllMode, groupAllMode }),
    [companyId, selectedGroup, groupsAllMode, groupAllMode],
  );
  const groupIds = useMemo(() => resolveMobileGroupIds(companies, me), [companies, me]);
  const tenantGroupOptions = useMemo(
    () => buildAdminGroupOptions(companies, groupIds),
    [companies, groupIds],
  );
  const tenantCompanyOptions = useMemo(
    () => buildAdminCompanyOptions(companies),
    [companies],
  );
  const selectedCompany = useMemo(
    () => companies.find((row) => Number(row.id) === Number(companyId)) || null,
    [companies, companyId],
  );
  /** Desktop parity: secondary password only for C168 company scopes or owner-shadow rows. */
  const isC168Company = useMemo(
    () => String(selectedCompany?.company_id || "").toUpperCase() === "C168",
    [selectedCompany],
  );
  const groupOnlyMode = accountScopeIsGroupOnly(scope);
  const mutationsBlocked = isPartnershipAuditReadOnlyLocked(me);
  /** Writes require an explicit single company — never All / group-only aggregate views. */
  const canMutate =
    !mutationsBlocked && !groupsAllMode && !groupAllMode && !groupOnlyMode && Number(companyId) > 0;

  const currentUserId = me?.user_id ?? null;
  const currentUserRole = normRole(me?.role);
  const useDualTenantPicker = currentUserRole === "admin" || currentUserRole === "owner";
  const isEditMode = Number(form.id) > 0;
  const fieldLocks = useMemo(
    () =>
      isEditMode && editingRow
        ? getUserEditFieldLocks(editingRow, currentUserId, currentUserRole)
        : { name: false, email: false, role: false, password: false, sidebar: false, company: false, accountProcess: false },
    [isEditMode, editingRow, currentUserId, currentUserRole],
  );
  const roleOptions = useMemo(
    () =>
      isEditMode
        ? getAvailableRolesForEdit(currentUserRole, editingRow?.role)
        : getAvailableRolesForCreation(currentUserRole),
    [isEditMode, currentUserRole, editingRow?.role],
  );
  const visiblePermissionKeys = useMemo(
    () => getVisiblePermissionKeys(form.role || editingRow?.role),
    [form.role, editingRow?.role],
  );
  const showReadOnlyToggle = useMemo(() => {
    const targetRole = normRole(form.role) || normRole(editingRow?.role);
    return (
      roleHasReadOnlyToggle(targetRole) && canInteractWithReadOnlyToggle(currentUserRole, targetRole)
    );
  }, [form.role, editingRow?.role, currentUserRole]);

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
          { signal: ac.signal },
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
        if (!canAccessAdmin(user)) {
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

  const fetchUsers = useCallback(
    async (signal) => {
      const body = { action: "get" };
      if (groupsAllMode) {
        body.groups_all = 1;
        body.group_all = 1;
      } else if (groupAllMode) {
        body.group_all = 1;
        if (selectedGroup) body.group_id = selectedGroup;
      } else if (groupOnlyMode && selectedGroup) {
        body.group_id = selectedGroup;
        body.group_only = 1;
        body.group_aggregate = 1;
      } else if (Number(companyId) > 0) {
        body.company_id = Number(companyId);
      }
      const json = await postUserlist(body, signal);
      let list = Array.isArray(json.data) ? json.data.map((u) => ({ ...u, is_owner_shadow: false })) : [];
      if (normRole(me?.role) === "owner" && me?.user_id) {
        try {
          const shadowJson = await postUserlist({ action: "get", id: me.user_id }, signal);
          const shadowRow = shadowJson?.data;
          if (shadowRow && normRole(shadowRow.role) === "owner") {
            const shadow = { ...shadowRow, is_owner_shadow: true };
            if (!list.some((u) => Number(u.id) === Number(shadow.id))) list = [shadow, ...list];
          }
        } catch {
          /* owner shadow optional */
        }
      }
      return list;
    },
    [companyId, groupAllMode, groupOnlyMode, groupsAllMode, me, selectedGroup],
  );

  useEffect(() => {
    if (!me || (!Number(companyId) && !groupOnlyMode && !groupsAllMode && !groupAllMode)) return;
    const seq = ++listSeq.current;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    fetchUsers(ac.signal)
      .then((rows) => {
        if (seq === listSeq.current) setUsers(rows);
      })
      .catch((e) => {
        if (e?.name !== "AbortError" && seq === listSeq.current) setError(e?.message || i18n.loadError);
      })
      .finally(() => {
        if (seq === listSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => ac.abort();
  }, [companyId, fetchUsers, groupAllMode, groupOnlyMode, groupsAllMode, i18n.loadError, me, reloadNonce]);

  const displayUsers = useMemo(
    () =>
      sortUsersByLogin(
        applyUserFilters(users, {
          search: debouncedSearch,
          showInactive,
          viewerRole: me?.role,
          viewerUserId: me?.user_id,
        }),
      ),
    [users, debouncedSearch, showInactive, me?.role, me?.user_id],
  );

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

  const rowCaps = useCallback(
    (row) => computeRowCapabilities(row, currentUserId, currentUserRole),
    [currentUserId, currentUserRole],
  );

  const loadDetail = useCallback(
    async (row) => {
      try {
        const json = await postUserlist({ action: "get", id: row.id });
        const data = { ...(json.data || {}), is_owner_shadow: !!row.is_owner_shadow };
        setDetail(data);
        return data;
      } catch (e) {
        notify(e?.message || i18n.detailError, "error");
        return null;
      }
    },
    [i18n.detailError, notify],
  );

  const toggleStatus = useCallback(
    async (row) => {
      if (!canMutate) {
        notify(i18n.readOnly, "error");
        return;
      }
      if (!rowCaps(row).canToggleStatus) return;
      try {
        const fd = new FormData();
        fd.append("id", String(row.id));
        if (Number(companyId) > 0) fd.append("company_id", String(companyId));
        const json = await readJson(buildApiUrl("api/users/toggle_status_api.php"), {
          method: "POST",
          body: fd,
        });
        const newStatus = json?.data?.newStatus || json?.newStatus;
        if (!newStatus) throw new Error(i18n.toggleError);
        setUsers((rows) =>
          rows.map((u) => (Number(u.id) === Number(row.id) ? { ...u, status: newStatus } : u)),
        );
        setDetail((d) => (Number(d?.id) === Number(row.id) ? { ...d, status: newStatus } : d));
        notify(i18n.statusUpdated);
      } catch (e) {
        notify(e?.message || i18n.toggleError, "error");
      }
    },
    [canMutate, companyId, i18n.readOnly, i18n.statusUpdated, i18n.toggleError, notify, rowCaps],
  );

  const deleteUser = useCallback(async () => {
    if (!detail || !canMutate) return false;
    if (normRole(detail.status) !== "inactive") {
      notify(i18n.deleteInactiveOnly, "error");
      return false;
    }
    if (!rowCaps(detail).canDelete) return false;
    setSaving(true);
    try {
      const body = { action: "delete", id: Number(detail.id) };
      if (Number(companyId) > 0) body.company_id = Number(companyId);
      await postUserlist(body);
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
  }, [canMutate, companyId, detail, i18n.deleteError, i18n.deleteInactiveOnly, i18n.deleteSuccess, notify, rowCaps]);

  const loadFormOptions = useCallback(async () => {
    const cid = Number(companyId);
    const [accJson, procJson] = await Promise.all([
      readJson(buildApiUrl(`api/accounts/accountlistapi.php?company_id=${cid}&for_assignment=1`)),
      readJson(buildApiUrl(`api/processes/processlist_api.php?company_id=${cid}&showAll=1&for_assignment=1`)),
    ]);
    const accounts = (accJson?.data?.accounts || [])
      .filter((a) => String(a.status || "").toLowerCase() === "active")
      .map((a) => ({ id: Number(a.id), account_id: a.account_id, name: String(a.name || "").trim() }));
    const procPayload = procJson?.data;
    const procRows = Array.isArray(procPayload) ? procPayload : procPayload?.processes || [];
    const processes = procRows
      .filter((p) => String(p.status || "").toLowerCase() === "active")
      .map((p) => ({
        id: Number(p.id),
        process_id: p.process_name || p.process_id || "",
        description: p.description_name || p.description || "",
      }));
    const nextToggleableAccounts = parseAssignableIds(accJson?.data?.toggleable_ids);
    const nextToggleableProcesses = Array.isArray(procPayload)
      ? null
      : parseAssignableIds(procPayload?.toggleable_ids);
    setFormAccounts(accounts);
    setFormProcesses(processes);
    setToggleableAccountIds(nextToggleableAccounts);
    setToggleableProcessIds(nextToggleableProcesses);
    return {
      accounts,
      processes,
      toggleableAccountIds: nextToggleableAccounts,
      toggleableProcessIds: nextToggleableProcesses,
    };
  }, [companyId]);

  const openCreate = useCallback(async () => {
    if (!canMutate) {
      notify(mutationsBlocked ? i18n.readOnly : i18n.singleCompanyRequired, "error");
      return false;
    }
    setEditingRow(null);
    setForm({ ...EMPTY_FORM });
    setPermSelected(new Set());
    if (useDualTenantPicker) {
      setSelectedTenantGroupIds(
        new Set(resolveAdminGroupEntityIds(tenantGroupOptions, selectedGroup ? [selectedGroup] : [])),
      );
      const allowedCompanies = new Set(tenantCompanyOptions.map((row) => Number(row.id)));
      setSelectedTenantCompanyIds(
        new Set(allowedCompanies.has(Number(companyId)) ? [Number(companyId)] : []),
      );
    } else {
      setSelectedTenantGroupIds(new Set());
      setSelectedTenantCompanyIds(new Set());
    }
    try {
      const { accounts, processes } = await loadFormOptions();
      setSelectedAccountIds(new Set(accounts.map((a) => a.id)));
      setSelectedProcessIds(new Set(processes.map((p) => p.id)));
      setSuperiorClosedAccountIds(new Set());
      setSuperiorClosedProcessIds(new Set());
      setBaselinePending(true);
      return true;
    } catch (e) {
      setBaselinePending(true);
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [
    canMutate,
    companyId,
    i18n.loadError,
    i18n.readOnly,
    i18n.singleCompanyRequired,
    loadFormOptions,
    mutationsBlocked,
    notify,
    selectedGroup,
    tenantCompanyOptions,
    tenantGroupOptions,
    useDualTenantPicker,
  ]);

  const openEdit = useCallback(async (source) => {
    const target = source || detail;
    if (!target) return false;
    if (!canMutate) {
      notify(mutationsBlocked ? i18n.readOnly : i18n.singleCompanyRequired, "error");
      return false;
    }
    if (!rowCaps(target).canEditDelete) return false;
    setEditingRow(target);
    setForm({
      id: target.id,
      login_id: String(target.login_id || ""),
      name: String(target.name || ""),
      email: String(target.email || ""),
      role: normRole(target.role),
      password: "",
      status: normRole(target.status) || "active",
      read_only: Number(target.read_only ?? 1) === 1,
    });
    setPermSelected(new Set(parseJsonArray(target.permissions)));
    if (useDualTenantPicker && !target.is_owner_shadow) {
      setSelectedTenantGroupIds(
        new Set(resolveAdminGroupEntityIds(tenantGroupOptions, parseJsonArray(target.group_codes))),
      );
      const allowedCompanies = new Set(tenantCompanyOptions.map((row) => Number(row.id)));
      setSelectedTenantCompanyIds(
        new Set(
          parseJsonArray(target.company_ids)
            .map(Number)
            .filter((id) => allowedCompanies.has(id)),
        ),
      );
    } else {
      setSelectedTenantGroupIds(new Set());
      setSelectedTenantCompanyIds(new Set());
    }
    try {
      const { accounts, processes } = await loadFormOptions();
      const accPartition = partitionAccessRows(
        parseAccessPermissionRaw(target.account_permissions),
        accounts,
      );
      const procPartition = partitionAccessRows(
        parseAccessPermissionRaw(target.process_permissions),
        processes,
      );
      setSelectedAccountIds(accPartition.selected);
      setSuperiorClosedAccountIds(accPartition.superiorClosed);
      setSelectedProcessIds(procPartition.selected);
      setSuperiorClosedProcessIds(procPartition.superiorClosed);
      setBaselinePending(true);
      return true;
    } catch (e) {
      setBaselinePending(true);
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [
    canMutate,
    detail,
    i18n.loadError,
    i18n.singleCompanyRequired,
    i18n.readOnly,
    loadFormOptions,
    mutationsBlocked,
    notify,
    rowCaps,
    tenantCompanyOptions,
    tenantGroupOptions,
    useDualTenantPicker,
  ]);

  /** New user: sidebar permissions follow the role template until manually changed. */
  const applyRoleTemplate = useCallback((role) => {
    setPermSelected(new Set(getRoleTemplateSidebarList(role)));
  }, []);

  const saveUser = useCallback(async () => {
    if (!canMutate) {
      notify(i18n.readOnly, "error");
      return false;
    }
    const editing = isEditMode;
    const ownerShadow = !!editingRow?.is_owner_shadow;
    if (!form.name.trim() || !form.email.trim() || (!ownerShadow && !form.role)) {
      notify(editing ? i18n.editRequiredFields : i18n.requiredFields, "error");
      return false;
    }
    if (!editing && (!form.login_id.trim() || !form.password.trim())) {
      notify(i18n.requiredFields, "error");
      return false;
    }
    const emailCheck = validateUserEmail(form.email);
    if (!emailCheck.ok) {
      notify(i18n.invalidEmail, "error");
      return false;
    }
    const selfAcc = editing && canSelfEditAccountAccess(editingRow, currentUserId, currentUserRole);
    const accountPerms = buildAccountPermissionPayload(
      formAccounts,
      selectedAccountIds,
      superiorClosedAccountIds,
      { isSelf: selfAcc, toggleableIds: toggleableAccountIds },
    );
    const processPerms = buildProcessPermissionPayload(
      formProcesses,
      selectedProcessIds,
      superiorClosedProcessIds,
      { isSelf: selfAcc, toggleableIds: toggleableProcessIds },
    );
    const payload = {
      action: editing ? "update" : "create",
      id: editing ? Number(form.id) : undefined,
      login_id: form.login_id.trim(),
      name: form.name.trim(),
      email: emailCheck.normalized,
      role: ownerShadow ? "owner" : form.role,
      status: form.status,
      company_id: Number(companyId),
    };
    if (form.password.trim()) payload.password = form.password;
    const allowSecondaryPassword = isC168Company || ownerShadow;
    if (allowSecondaryPassword && form.secondary_password?.trim()) {
      if (!/^\d{6}$/.test(form.secondary_password.trim())) {
        notify(i18n.secondaryPasswordMustBe6Digits, "error");
        return false;
      }
      payload.secondary_password = form.secondary_password.trim();
    }
    if (showReadOnlyToggle) payload.read_only = form.read_only ? 1 : 0;
    const isAdminOrOwner = currentUserRole === "admin" || currentUserRole === "owner";
    if (useDualTenantPicker && !ownerShadow) {
      payload.mixed_tenant_assign = 1;
      payload.group_codes = resolveAdminGroupCodes(tenantGroupOptions, selectedTenantGroupIds);
      payload.company_ids = [...selectedTenantCompanyIds];
      if (selectedGroup) payload.group_id = String(selectedGroup).trim().toUpperCase();
    }
    if (!editing) {
      payload.permissions = getFinalPermissionsForCreation(form.role, [...permSelected], currentUserRole);
      payload.account_permissions = accountPerms;
      payload.process_permissions = processPerms;
      if (isAdminOrOwner && !useDualTenantPicker) payload.company_ids = [Number(companyId)];
    } else if (!ownerShadow) {
      if (!fieldLocks.sidebar) payload.permissions = [...permSelected];
      if (!fieldLocks.accountProcess || selfAcc) {
        payload.account_permissions = accountPerms;
        payload.process_permissions = processPerms;
      }
      if (isAdminOrOwner && !useDualTenantPicker && !fieldLocks.company) {
        payload.company_ids = [Number(companyId)];
      }
    }
    setSaving(true);
    try {
      await postUserlist(payload);
      notify(i18n.saveSuccess);
      setReloadNonce((value) => value + 1);
      if (editing) await loadDetail({ id: form.id, is_owner_shadow: ownerShadow });
      return true;
    } catch (e) {
      notify(e?.message || i18n.saveError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    canMutate,
    companyId,
    currentUserId,
    currentUserRole,
    editingRow,
    fieldLocks,
    form,
    formAccounts,
    formProcesses,
    i18n,
    isEditMode,
    loadDetail,
    notify,
    permSelected,
    selectedAccountIds,
    selectedProcessIds,
    selectedGroup,
    selectedTenantCompanyIds,
    selectedTenantGroupIds,
    showReadOnlyToggle,
    superiorClosedAccountIds,
    superiorClosedProcessIds,
    tenantGroupOptions,
    toggleableAccountIds,
    toggleableProcessIds,
    useDualTenantPicker,
  ]);

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
    isC168Company,
    groupIds,
    companiesForPicker: companiesForPicker(companies, {
      selectedGroup,
      groupsAllMode,
      preferredCompanyId: companyId,
    }),
    canUseGroupOnlyForGroup: (group) => canUseGroupOnlyMode(me, group, companies),
    resolveCompanyForGroup: (group, current) => resolveCompanyPickForGroup(companies, group, current),
    applyScope,
    users: displayUsers,
    search,
    setSearch,
    showInactive,
    setShowInactive,
    loading,
    refreshing,
    error,
    blocked,
    toast,
    refresh,
    mutationsBlocked,
    canMutate,
    rowCaps,
    detail,
    setDetail,
    loadDetail,
    toggleStatus,
    deleteUser,
    form,
    setForm,
    isEditMode,
    editingRow,
    fieldLocks,
    roleOptions,
    visiblePermissionKeys,
    showReadOnlyToggle,
    permSelected,
    setPermSelected,
    applyRoleTemplate,
    formAccounts,
    formProcesses,
    selectedAccountIds,
    setSelectedAccountIds,
    selectedProcessIds,
    setSelectedProcessIds,
    toggleableAccountIds,
    toggleableProcessIds,
    superiorClosedAccountIds,
    setSuperiorClosedAccountIds,
    superiorClosedProcessIds,
    setSuperiorClosedProcessIds,
    selfToggle: isEditMode && canSelfEditAccountAccess(editingRow, currentUserId, currentUserRole),
    useDualTenantPicker,
    tenantGroupOptions,
    tenantCompanyOptions,
    selectedTenantGroupIds,
    setSelectedTenantGroupIds,
    selectedTenantCompanyIds,
    setSelectedTenantCompanyIds,
    openCreate,
    openEdit,
    saveUser,
    isFormDirty,
    saving,
    logout,
    notify,
  };
}
