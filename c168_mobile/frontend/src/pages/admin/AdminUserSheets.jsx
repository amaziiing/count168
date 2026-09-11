import { useEffect, useMemo, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { formatLastLogin, normRole, sortAccessItems } from "../../lib/mobileUserAdmin.js";
import PasswordInput from "../../components/PasswordInput.jsx";
import "../transaction/add-transaction-sheet.css";

const PERM_LABEL_KEYS = {
  home: "permHome",
  admin: "permAdmin",
  account: "permAccount",
  ownership: "permOwnership",
  process: "permProcess",
  datacapture: "permDatacapture",
  payment: "permPayment",
  report: "permReport",
  maintenance: "permMaintenance",
};

function Sheet({ open, title, onClose, tall = false, children, footer = null }) {
  useOverlayLock(open, onClose);
  return (
    <div
      className={`m-sheet-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`m-sheet-panel${tall ? " m-sheet-panel--tall" : ""}${
          open ? " m-sheet-panel--open" : " m-sheet-panel--closed"
        }`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button type="button" className="m-sheet-close tap-scale" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-account-sheet-body">{children}</div>
        {footer ? <footer className="m-account-sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function UserDetailSheet({ open, onClose, admin, onEdit }) {
  const row = admin.detail;
  const { i18n } = admin;
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!open) setConfirmDelete(false);
  }, [open]);
  if (!row) return null;
  const caps = admin.rowCaps(row);
  const active = normRole(row.status) === "active";
  const values = [
    [i18n.email, row.email || "-"],
    [
      i18n.status,
      <span key="status" className={`m-account-status m-admin-detail-status ${active ? "active" : "inactive"}`}>
        {active ? i18n.active : i18n.inactive}
      </span>,
    ],
    [i18n.lastLogin, formatLastLogin(row.last_login)],
    [i18n.createdBy, String(row.created_by || "-").toUpperCase()],
  ];
  const canDelete = admin.canMutate && caps.canDelete && !active;
  return (
    <Sheet open={open} title={i18n.userDetail} onClose={onClose}>
      {row.is_owner_shadow ? <p className="m-admin-shadow-hint">{i18n.ownerShadowHint}</p> : null}
      <div className="m-account-detail-head">
        <span className="m-account-avatar">{String(row.login_id || "U").slice(0, 2)}</span>
        <div>
          <strong>{String(row.login_id || "").toUpperCase()}</strong>
          <p>{String(row.name || "").toUpperCase()}</p>
        </div>
        <span className="m-account-role-badge">{String(row.role || "").toUpperCase()}</span>
      </div>
      <dl className="m-account-detail-list">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "-"}</dd>
          </div>
        ))}
      </dl>
      {confirmDelete ? (
        <div className="m-admin-delete-confirm">
          <p>{i18n.deleteConfirm}</p>
          <div className="m-admin-delete-actions">
            <button type="button" className="m-admin-btn" onClick={() => setConfirmDelete(false)}>
              {i18n.cancel}
            </button>
            <button
              type="button"
              className="m-admin-btn m-admin-btn--danger"
              disabled={admin.saving}
              onClick={async () => {
                if (await admin.deleteUser()) onClose();
              }}
            >
              {i18n.delete}
            </button>
          </div>
        </div>
      ) : (
        <div className="m-admin-detail-actions">
          {caps.canEditDelete ? (
            <button
              type="button"
              className="m-admin-btn m-admin-btn--primary"
              disabled={!admin.canMutate}
              onClick={onEdit}
            >
              {i18n.edit}
            </button>
          ) : null}
          {caps.canToggleStatus ? (
            <button
              type="button"
              className="m-admin-btn"
              disabled={!admin.canMutate}
              onClick={() => admin.toggleStatus(row)}
            >
              {active ? i18n.inactive : i18n.active}
            </button>
          ) : null}
          {caps.canDelete ? (
            <button
              type="button"
              className="m-admin-btn m-admin-btn--danger"
              disabled={!canDelete}
              title={active ? i18n.deleteInactiveOnly : ""}
              onClick={() => setConfirmDelete(true)}
            >
              {i18n.delete}
            </button>
          ) : null}
        </div>
      )}
      {caps.canDelete && active ? (
        <p className="m-admin-field-hint">{i18n.deleteInactiveOnly}</p>
      ) : null}
    </Sheet>
  );
}

function AccessPickerSheet({
  open,
  onClose,
  title,
  i18n,
  options,
  selected,
  setSelected,
  labelOf,
  codeKey,
  toggleableIds = null,
  superiorClosedIds = null,
  setSuperiorClosedIds = null,
  selfToggle = false,
  locked = false,
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const closedIds = superiorClosedIds instanceof Set ? superiorClosedIds : new Set();
  const sorted = useMemo(
    () => sortAccessItems(options, selected, codeKey),
    [options, selected, codeKey],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((opt) => labelOf(opt).toLowerCase().includes(q));
  }, [sorted, query, labelOf]);
  const bulkIdList = useMemo(() => {
    const ids = (options || []).map((opt) => Number(opt.id)).filter((id) => id > 0);
    const source = toggleableIds == null ? ids : ids.filter((id) => toggleableIds.has(id));
    if (selfToggle) return source.filter((id) => !closedIds.has(id));
    return source;
  }, [closedIds, options, selfToggle, toggleableIds]);
  const isItemLocked = (id) => {
    if (locked) return true;
    if (selfToggle && closedIds.has(id)) return true;
    return toggleableIds != null && !toggleableIds.has(id);
  };
  const onToggle = (id) => {
    const nid = Number(id);
    if (isItemLocked(nid)) return;
    const checked = !selected.has(nid);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(nid);
      else next.delete(nid);
      return next;
    });
    if (typeof setSuperiorClosedIds === "function" && !selfToggle) {
      setSuperiorClosedIds((prev) => {
        const next = new Set(prev);
        if (checked) next.delete(nid);
        else next.add(nid);
        return next;
      });
    }
  };
  const runBulk = (selectAll) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      bulkIdList.forEach((id) => {
        if (selectAll) next.add(id);
        else next.delete(id);
      });
      return next;
    });
    if (typeof setSuperiorClosedIds === "function" && !selfToggle) {
      setSuperiorClosedIds((prev) => {
        const next = new Set(prev);
        bulkIdList.forEach((id) => {
          if (selectAll) next.delete(id);
          else next.add(id);
        });
        return next;
      });
    }
  };
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      tall
      footer={
        <button type="button" className="m-account-primary-btn tap-scale" onClick={onClose}>
          {i18n.done}
        </button>
      }
    >
      <label className="m-account-sheet-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={i18n.searchOptions} />
      </label>
      <div className="m-admin-picker-bulk">
        <button type="button" className="m-admin-btn" disabled={locked} onClick={() => runBulk(true)}>
          {i18n.selectAll}
        </button>
        <button type="button" className="m-admin-btn" disabled={locked} onClick={() => runBulk(false)}>
          {i18n.clearAll}
        </button>
        <span className="m-admin-picker-count">
          {i18n.selectedCount.replace("{count}", String(selected.size))}
        </span>
      </div>
      <div className="m-admin-picker-list">
        {visible.map((opt) => {
          const id = Number(opt.id);
          const checked = selected.has(id);
          const itemLocked = isItemLocked(id);
          return (
            <button
              type="button"
              key={id}
              disabled={itemLocked}
              aria-pressed={checked}
              aria-disabled={itemLocked}
              className={`m-admin-picker-item tap-scale${checked ? " is-checked" : ""}${
                itemLocked ? " is-locked" : ""
              }`}
              onClick={() => onToggle(id)}
            >
              <i className={`${checked ? "fas fa-square-check" : "far fa-square"}`} aria-hidden="true" />
              <span>{labelOf(opt)}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function TenantAssignmentSheet({ open, onClose, admin }) {
  const { i18n } = admin;
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filterRows = (rows, labelOf) => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) => labelOf(row).includes(q));
  };
  const groupLabel = (row) => String(row.group_id || row.company_id || "").trim().toUpperCase();
  const companyLabel = (row) => String(row.company_id || "").trim().toUpperCase();
  const groups = filterRows(admin.tenantGroupOptions, groupLabel);
  const companies = filterRows(admin.tenantCompanyOptions, companyLabel);
  const selectedCount =
    admin.selectedTenantGroupIds.size + admin.selectedTenantCompanyIds.size;
  const disabled = admin.fieldLocks.company || !!admin.editingRow?.is_owner_shadow;

  const renderRows = (rows, selected, setSelected, labelOf, prefix) =>
    rows.map((row) => {
      const id = Number(row.id);
      const checked = selected.has(id);
      return (
        <button
          type="button"
          key={`${prefix}-${id}`}
          disabled={disabled}
          aria-pressed={checked}
          className={`m-admin-picker-item tap-scale${checked ? " is-checked" : ""}`}
          onClick={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        >
          <i className={`${checked ? "fas fa-square-check" : "far fa-square"}`} aria-hidden="true" />
          <span>{labelOf(row)}</span>
        </button>
      );
    });

  return (
    <Sheet
      open={open}
      title={i18n.belonging}
      onClose={onClose}
      tall
      footer={
        <button type="button" className="m-account-primary-btn tap-scale" onClick={onClose}>
          {i18n.done}
        </button>
      }
    >
      <label className="m-account-sheet-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={i18n.searchGroupCompany} />
      </label>
      <div className="m-admin-picker-bulk">
        <button
          type="button"
          className="m-admin-btn"
          disabled={disabled}
          onClick={() => {
            admin.setSelectedTenantGroupIds(new Set(admin.tenantGroupOptions.map((row) => Number(row.id))));
            admin.setSelectedTenantCompanyIds(new Set(admin.tenantCompanyOptions.map((row) => Number(row.id))));
          }}
        >
          {i18n.selectAll}
        </button>
        <button
          type="button"
          className="m-admin-btn"
          disabled={disabled}
          onClick={() => {
            admin.setSelectedTenantGroupIds(new Set());
            admin.setSelectedTenantCompanyIds(new Set());
          }}
        >
          {i18n.clearAll}
        </button>
        <span className="m-admin-picker-count">
          {i18n.selectedCount.replace("{count}", String(selectedCount))}
        </span>
      </div>
      <section className="m-admin-tenant-section">
        <p className="m-account-section-title">{i18n.groupsSection}</p>
        <div className="m-admin-picker-list">
          {groups.length
            ? renderRows(
                groups,
                admin.selectedTenantGroupIds,
                admin.setSelectedTenantGroupIds,
                groupLabel,
                "group",
              )
            : <p className="m-admin-picker-empty">{i18n.noGroups}</p>}
        </div>
      </section>
      <section className="m-admin-tenant-section">
        <p className="m-account-section-title">{i18n.companiesSection}</p>
        <div className="m-admin-picker-list">
          {companies.length
            ? renderRows(
                companies,
                admin.selectedTenantCompanyIds,
                admin.setSelectedTenantCompanyIds,
                companyLabel,
                "company",
              )
            : <p className="m-admin-picker-empty">{i18n.noCompanies}</p>}
        </div>
      </section>
    </Sheet>
  );
}

export function UserFormSheet({ open, onClose, admin }) {
  const { i18n, form, setForm, fieldLocks, isEditMode } = admin;
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [processPickerOpen, setProcessPickerOpen] = useState(false);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const ownerShadow = !!admin.editingRow?.is_owner_shadow;
  const selfToggle = !!admin.selfToggle;
  const caps = admin.editingRow ? admin.rowCaps(admin.editingRow) : null;
  const rowInactive = normRole(admin.editingRow?.status) === "inactive";
  const accessLocked = ownerShadow || (!!fieldLocks.accountProcess && !selfToggle);
  const groupLabel = String(
    admin.selectedGroup || admin.selectedCompany?.group_id || "",
  ).toUpperCase();
  const companyLabel = String(admin.selectedCompany?.company_id || "").toUpperCase();
  const selectedTenantLabels = useMemo(() => {
    const groups = admin.tenantGroupOptions
      .filter((row) => admin.selectedTenantGroupIds.has(Number(row.id)))
      .map((row) => String(row.group_id || row.company_id || "").trim().toUpperCase());
    const companies = admin.tenantCompanyOptions
      .filter((row) => admin.selectedTenantCompanyIds.has(Number(row.id)))
      .map((row) => String(row.company_id || "").trim().toUpperCase());
    return [...groups, ...companies];
  }, [
    admin.selectedTenantCompanyIds,
    admin.selectedTenantGroupIds,
    admin.tenantCompanyOptions,
    admin.tenantGroupOptions,
  ]);

  const requestClose = () => {
    // Untouched form: close straight away — no "discard unsaved changes?" nag.
    if (!admin.isFormDirty || window.confirm(i18n.discardConfirm)) onClose();
  };

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const permChips = admin.visiblePermissionKeys.map((key) => {
    const selected = admin.permSelected.has(key);
    return (
      <button
        type="button"
        key={key}
        disabled={fieldLocks.sidebar || ownerShadow}
        aria-pressed={selected}
        className={`m-account-pill tap-scale${selected ? " is-active" : ""}`}
        onClick={() =>
          admin.setPermSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
      >
        {i18n[PERM_LABEL_KEYS[key]] || key}
      </button>
    );
  });

  return (
    <>
      <Sheet
        open={open && !tenantPickerOpen && !accountPickerOpen && !processPickerOpen}
        title={isEditMode ? i18n.editUser : i18n.addUser}
        onClose={requestClose}
        tall
        footer={
          <>
            <div className="m-account-footer-actions">
              <button
                type="button"
                className="m-account-primary-btn tap-scale"
                disabled={admin.saving}
                onClick={async () => {
                  if (await admin.saveUser()) onClose();
                }}
              >
                {admin.saving ? i18n.saving : i18n.save}
              </button>
            </div>
            {isEditMode && caps?.canDelete ? (
              <button
                type="button"
                className="m-account-danger-btn tap-scale"
                disabled={!rowInactive || !admin.canMutate || admin.saving}
                title={rowInactive ? "" : i18n.deleteInactiveOnly}
                onClick={async () => {
                  if (!window.confirm(i18n.deleteConfirm)) return;
                  if (await admin.deleteUser()) onClose();
                }}
              >
                <i className="fas fa-trash" aria-hidden="true" /> {i18n.delete}
              </button>
            ) : null}
          </>
        }
      >
        {ownerShadow ? <p className="m-admin-shadow-hint">{i18n.ownerShadowHint}</p> : null}

        <div className="m-account-sheet-section">
          <p className="m-account-section-title">{i18n.basicInfo}</p>
          <div className="m-account-form-grid">
            <label className="m-account-form-field">
              <span>{i18n.loginId}</span>
              <input
                value={form.login_id}
                disabled={isEditMode}
                onChange={set("login_id")}
                autoCapitalize="characters"
              />
            </label>
            <label className="m-account-form-field">
              <span>{i18n.password}</span>
              <PasswordInput
                value={form.password}
                disabled={fieldLocks.password}
                onChange={set("password")}
                placeholder={isEditMode ? i18n.passwordEditHint : ""}
                autoComplete="new-password"
                showLabel={i18n.showPassword}
                hideLabel={i18n.hidePassword}
              />
            </label>
            {admin.isC168Company || ownerShadow ? (
              <label className="m-account-form-field">
                <span>{i18n.secondaryPassword}</span>
                <PasswordInput
                  value={form.secondary_password}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      secondary_password: e.target.value.replace(/\D/g, "").slice(0, 6),
                    }))
                  }
                  placeholder={i18n.secondaryPasswordPlaceholder}
                  autoComplete="off"
                  inputMode="numeric"
                  showLabel={i18n.showPassword}
                  hideLabel={i18n.hidePassword}
                />
              </label>
            ) : null}
            <label className="m-account-form-field">
              <span>{i18n.name}</span>
              <input value={form.name} disabled={fieldLocks.name} onChange={set("name")} />
            </label>
            <label className="m-account-form-field">
              <span>{i18n.email}</span>
              <input type="email" value={form.email} disabled={fieldLocks.email} onChange={set("email")} />
            </label>
            {!ownerShadow ? (
              <label className="m-account-form-field">
                <span>{i18n.role}</span>
                <select
                  value={form.role}
                  disabled={fieldLocks.role || !admin.roleOptions.length}
                  onChange={(e) => {
                    const role = e.target.value;
                    setForm((prev) => ({ ...prev, role }));
                    if (!isEditMode) admin.applyRoleTemplate(role);
                  }}
                >
                  <option value="">{i18n.selectRole}</option>
                  {admin.roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {form.role && !admin.roleOptions.some((opt) => opt.value === form.role) ? (
                    <option value={form.role}>{String(form.role).toUpperCase()}</option>
                  ) : null}
                </select>
              </label>
            ) : null}
            {isEditMode && !ownerShadow ? (
              <label className="m-account-form-field">
                <span>{i18n.status}</span>
                <select
                  value={form.status}
                  disabled={!admin.canMutate || (caps ? !caps.canToggleStatus : false)}
                  onChange={set("status")}
                >
                  <option value="active">{i18n.active}</option>
                  <option value="inactive">{i18n.inactive}</option>
                </select>
              </label>
            ) : null}
          </div>
          {admin.showReadOnlyToggle && !ownerShadow ? (
            <button
              type="button"
              className="m-admin-toggle-row tap-scale"
              onClick={() => setForm((prev) => ({ ...prev, read_only: !prev.read_only }))}
            >
              <span>{i18n.readOnlyToggle}</span>
              <span className={`m-account-switch ${form.read_only ? "is-on" : ""}`}>
                <span />
              </span>
            </button>
          ) : null}
        </div>

        <div className="m-account-sheet-section">
          <p className="m-account-section-title">{i18n.belonging}</p>
          {admin.useDualTenantPicker && !ownerShadow ? (
            <button
              type="button"
              className="m-admin-access-row tap-scale"
              disabled={fieldLocks.company}
              onClick={() => setTenantPickerOpen(true)}
            >
              <span>{i18n.selectGroupCompany}</span>
              <small>
                {selectedTenantLabels.length
                  ? selectedTenantLabels.join(" · ")
                  : i18n.noneSelected}
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </small>
            </button>
          ) : (
            <div className="m-admin-belonging">
              {groupLabel ? <span className="m-admin-belonging-chip is-group">{groupLabel}</span> : null}
              {companyLabel ? <span className="m-admin-belonging-chip">{companyLabel}</span> : null}
            </div>
          )}
        </div>

        {!ownerShadow ? (
          <>
            <div className="m-account-sheet-section">
              <p className="m-account-section-title">{i18n.pagePermissions}</p>
              <div className="m-account-pill-row m-admin-pill-wrap">{permChips}</div>
            </div>

            <div className="m-account-sheet-section">
              <p className="m-account-section-title">{i18n.dataPermissions}</p>
              <button
                type="button"
                className="m-admin-access-row tap-scale"
                disabled={accessLocked}
                onClick={() => setAccountPickerOpen(true)}
              >
                <span>{i18n.accountPermissions}</span>
                <small>
                  {i18n.selectedCount.replace("{count}", String(admin.selectedAccountIds.size))}
                  <i className="fas fa-chevron-right" aria-hidden="true" />
                </small>
              </button>
              <button
                type="button"
                className="m-admin-access-row tap-scale"
                disabled={accessLocked}
                onClick={() => setProcessPickerOpen(true)}
              >
                <span>{i18n.processPermissions}</span>
                <small>
                  {i18n.selectedCount.replace("{count}", String(admin.selectedProcessIds.size))}
                  <i className="fas fa-chevron-right" aria-hidden="true" />
                </small>
              </button>
            </div>
          </>
        ) : null}
      </Sheet>

      <TenantAssignmentSheet
        open={tenantPickerOpen}
        onClose={() => setTenantPickerOpen(false)}
        admin={admin}
      />
      <AccessPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        title={i18n.accountPermissions}
        i18n={i18n}
        options={admin.formAccounts}
        selected={admin.selectedAccountIds}
        setSelected={admin.setSelectedAccountIds}
        labelOf={(opt) => `${String(opt.account_id || "").toUpperCase()} · ${String(opt.name || "").toUpperCase()}`}
        codeKey="account_id"
        toggleableIds={admin.toggleableAccountIds}
        superiorClosedIds={admin.superiorClosedAccountIds}
        setSuperiorClosedIds={admin.setSuperiorClosedAccountIds}
        selfToggle={selfToggle}
        locked={accessLocked}
      />
      <AccessPickerSheet
        open={processPickerOpen}
        onClose={() => setProcessPickerOpen(false)}
        title={i18n.processPermissions}
        i18n={i18n}
        options={admin.formProcesses}
        selected={admin.selectedProcessIds}
        setSelected={admin.setSelectedProcessIds}
        labelOf={(opt) => `${String(opt.process_id || "").toUpperCase()} · ${String(opt.description || "").toUpperCase()}`}
        codeKey="process_id"
        toggleableIds={admin.toggleableProcessIds}
        superiorClosedIds={admin.superiorClosedProcessIds}
        setSuperiorClosedIds={admin.setSuperiorClosedProcessIds}
        selfToggle={selfToggle}
        locked={accessLocked}
      />
    </>
  );
}
