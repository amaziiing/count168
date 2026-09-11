import { useEffect, useMemo, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { buildAccountScopeDraft } from "../../lib/mobileAccountScope.js";
import { formatDisplayDate } from "../../lib/dashboardDateUtils.js";
import PasswordInput from "../../components/PasswordInput.jsx";
import "../transaction/add-transaction-sheet.css";

/* Same iOS-safe pattern as AddTransactionSheet: visible formatted row,
   native date picker as an opacity-0 overlay. */
function DateTapRow({ label, value, onChange, disabled }) {
  return (
    <label className={`m-tx-date-row${disabled ? " m-tx-date-row--disabled" : ""}`}>
      <span className="m-tx-date-icon">
        <i className="far fa-calendar" aria-hidden="true" />
      </span>
      <span className="m-tx-date-main">
        <span className="m-tx-date-label">{label}</span>
        <span className="m-tx-date-value-row">
          <span className="m-tx-date-value">{value ? formatDisplayDate(value) : "—"}</span>
        </span>
      </span>
      <i className="fas fa-chevron-right m-tx-date-chevron" aria-hidden="true" />
      <input
        type="date"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="m-tx-date-input"
        aria-label={label}
      />
    </label>
  );
}

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

function Pill({ active, onClick, children, disabled = false, violet = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`m-account-pill tap-scale${active ? " is-active" : ""}${
        violet ? " is-violet" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function AccountScopeSheet({ open, onClose, account }) {
  const { i18n } = account;
  const [draft, setDraft] = useState(() => buildAccountScopeDraft(account));
  useEffect(() => {
    if (open) setDraft(buildAccountScopeDraft(account));
  }, [open]);

  const companies = useMemo(() => {
    if (draft.groupsAllMode || !draft.selectedGroup) return account.companies;
    return account.companies.filter(
      (row) => String(row?.group_id || "").toUpperCase() === String(draft.selectedGroup).toUpperCase(),
    );
  }, [account.companies, draft.groupsAllMode, draft.selectedGroup]);

  const pickGroup = (group) => {
    const canGroupOnly = account.canUseGroupOnlyForGroup(group);
    const company = canGroupOnly
      ? null
      : account.resolveCompanyForGroup(group, draft.companyId);
    setDraft({
      selectedGroup: group,
      groupsAllMode: false,
      groupAllMode: false,
      companyId: company?.id ? Number(company.id) : null,
    });
  };

  return (
    <Sheet
      open={open}
      title={i18n.switchCompany}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="m-account-primary-btn tap-scale"
          onClick={async () => {
            if (await account.applyScope(draft)) onClose();
          }}
        >
          {i18n.apply}
        </button>
      }
    >
      {account.groupIds.length ? (
        <div className="m-account-sheet-section">
          <p className="m-account-section-title">{i18n.groupId}</p>
          <div className="m-account-pill-row">
            <Pill
              violet
              active={draft.groupsAllMode}
              onClick={() =>
                setDraft({
                  selectedGroup: null,
                  groupsAllMode: true,
                  groupAllMode: false,
                  companyId: null,
                })
              }
            >
              {i18n.all}
            </Pill>
            {account.groupIds.map((group) => (
              <Pill
                key={group}
                violet
                active={!draft.groupsAllMode && draft.selectedGroup === group}
                onClick={() => pickGroup(group)}
              >
                {group}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
      <div className="m-account-sheet-section">
        <p className="m-account-section-title">{i18n.company}</p>
        <div className="m-account-pill-row">
          {draft.selectedGroup ? (
            <Pill
              active={draft.groupAllMode}
              onClick={() => setDraft((value) => ({ ...value, groupAllMode: true }))}
            >
              {i18n.all}
            </Pill>
          ) : null}
          {companies
            .filter((row) => Number(row?.id) > 0 && String(row?.company_id || "").trim())
            .map((row) => (
              <Pill
                key={row.id}
                active={!draft.groupAllMode && Number(draft.companyId) === Number(row.id)}
                onClick={() =>
                  setDraft((value) => ({
                    ...value,
                    companyId: Number(row.id),
                    groupAllMode: false,
                    groupsAllMode: false,
                    selectedGroup:
                      value.selectedGroup || (row.group_id ? String(row.group_id).toUpperCase() : null),
                  }))
                }
              >
                {String(row.company_id).toUpperCase()}
              </Pill>
            ))}
        </div>
      </div>
      <p className="m-account-sheet-hint">{i18n.allScopeHint}</p>
    </Sheet>
  );
}

export function AccountDetailSheet({ open, onClose, account, onEdit, onLink }) {
  const row = account.detail;
  const { i18n } = account;
  if (!row) return null;
  const values = [
    [i18n.accountId, row.account_id],
    [i18n.name, row.name],
    [i18n.role, row.role],
    [i18n.status, String(row.status || "").toLowerCase() === "active" ? i18n.active : i18n.inactive],
    [i18n.paymentAlert, Number(row.payment_alert) ? "ON" : "OFF"],
    [i18n.lastLogin, row.last_login || "—"],
    [i18n.remark, row.remark || "—"],
  ];
  return (
    <Sheet
      open={open}
      title={i18n.accountDetail}
      onClose={onClose}
      footer={
        <>
          <div className="m-account-footer-actions">
            <button
              type="button"
              disabled={!account.canMutate}
              className="m-account-secondary-btn tap-scale"
              onClick={onEdit}
            >
              <i className="fas fa-pen" aria-hidden="true" /> {i18n.edit}
            </button>
            <button
              type="button"
              disabled={!account.canMutate}
              className="m-account-primary-btn tap-scale"
              onClick={onLink}
            >
              <i className="fas fa-link" aria-hidden="true" /> {i18n.linkAccount}
            </button>
          </div>
          {String(row.status || "").toLowerCase() === "inactive" ? (
            <button
              type="button"
              disabled={!account.canMutate || account.saving}
              className="m-account-danger-btn tap-scale"
              onClick={async () => {
                if (!window.confirm(i18n.deleteConfirm)) return;
                if (await account.deleteAccount()) onClose();
              }}
            >
              <i className="fas fa-trash" aria-hidden="true" /> {i18n.delete}
            </button>
          ) : null}
        </>
      }
    >
      <div className="m-account-detail-head">
        <span className="m-account-avatar">{String(row.account_id || "A").slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{String(row.account_id || "").toUpperCase()}</strong>
          <p>{String(row.name || "").toUpperCase()}</p>
        </div>
        <span className="m-account-role-badge">{String(row.role || "—").toUpperCase()}</span>
      </div>
      <dl className="m-account-detail-list">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{String(value || "—").toUpperCase()}</dd>
          </div>
        ))}
      </dl>
      <div className="m-account-detail-toggles">
        <button
          type="button"
          disabled={!account.canMutate}
          onClick={() => account.toggleStatus(row)}
          className="m-account-toggle-row tap-scale"
        >
          <span>{i18n.status}</span>
          <span className={`m-account-status ${String(row.status).toLowerCase()}`}>{row.status}</span>
        </button>
        <button
          type="button"
          disabled={!account.canMutate}
          onClick={async () => {
            const result = await account.toggleAlert(row);
            if (result === "needsEdit") onEdit?.();
          }}
          className="m-account-toggle-row tap-scale"
        >
          <span>{i18n.paymentAlert}</span>
          <span className={`m-account-switch ${Number(row.payment_alert) ? "is-on" : ""}`}>
            <span />
          </span>
        </button>
      </div>
    </Sheet>
  );
}

export function AccountFormSheet({ open, onClose, account, onLinkAccount }) {
  const { i18n, form, setForm } = account;
  const editing = Number(form.id) > 0;
  const detailRow = account.detail;
  const canDelete =
    editing && detailRow && String(detailRow.status || "").toLowerCase() === "inactive";
  const update = (key, value) => setForm((row) => ({ ...row, [key]: value }));
  return (
    <Sheet
      open={open}
      title={editing ? i18n.editAccount : i18n.addAccount}
      onClose={onClose}
      tall
      footer={
        <>
          <div className="m-account-footer-actions">
            {editing && onLinkAccount ? (
              <button
                type="button"
                disabled={!account.canMutate}
                className="m-account-secondary-btn tap-scale"
                onClick={onLinkAccount}
              >
                <i className="fas fa-link" aria-hidden="true" /> {i18n.linkAccount}
              </button>
            ) : null}
            <button
              type="button"
              disabled={account.saving}
              className="m-account-primary-btn tap-scale"
              onClick={async () => {
                if (await account.saveAccount()) onClose();
              }}
            >
              {account.saving ? i18n.saving : i18n.save}
            </button>
          </div>
          {canDelete ? (
            <button
              type="button"
              disabled={!account.canMutate || account.saving}
              className="m-account-danger-btn tap-scale"
              onClick={async () => {
                if (!window.confirm(i18n.deleteConfirm)) return;
                if (await account.deleteAccount()) onClose();
              }}
            >
              <i className="fas fa-trash" aria-hidden="true" /> {i18n.delete}
            </button>
          ) : null}
        </>
      }
    >
      <label className={`m-account-status-card${(form.status || "active") === "active" ? " is-active" : ""}`}>
        <span
          className={`m-account-status ${(form.status || "active") === "active" ? "active" : "inactive"}`}
        >
          {(form.status || "active") === "active" ? i18n.active : i18n.inactive}
        </span>
        <input
          type="checkbox"
          checked={(form.status || "active") === "active"}
          disabled={!account.canMutate}
          onChange={(e) => update("status", e.target.checked ? "active" : "inactive")}
        />
        <span className={`m-account-switch ${(form.status || "active") === "active" ? "is-on" : ""}`}>
          <span />
        </span>
      </label>
      <div className="m-account-form-grid">
        <FormField label={`${i18n.accountId} *`}>
          <input
            value={form.account_id}
            disabled={editing}
            onChange={(e) => update("account_id", e.target.value)}
            style={{ textTransform: "uppercase" }}
          />
        </FormField>
        <FormField label={`${i18n.name} *`}>
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            style={{ textTransform: "uppercase" }}
          />
        </FormField>
        <FormField label={`${i18n.role} *`}>
          <select value={form.role} onChange={(e) => update("role", e.target.value)}>
            <option value="">{i18n.selectRole}</option>
            {account.roles.map((role) => (
              <option key={role} value={role}>
                {String(role).toUpperCase()}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={`${i18n.password}${editing ? "" : " *"}`} hint={editing ? i18n.passwordEditHint : ""}>
          <PasswordInput
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            showLabel={i18n.showPassword}
            hideLabel={i18n.hidePassword}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label={i18n.remark}>
          <textarea
            value={form.remark}
            onChange={(e) => update("remark", e.target.value)}
            style={{ textTransform: "uppercase" }}
          />
        </FormField>
      </div>
      <div className="m-account-form-card">
        <label className="m-account-toggle-row">
          <span>{i18n.paymentAlert}</span>
          <input
            type="checkbox"
            checked={form.payment_alert === "1"}
            onChange={(e) => update("payment_alert", e.target.checked ? "1" : "0")}
          />
          <span className={`m-account-switch ${form.payment_alert === "1" ? "is-on" : ""}`}>
            <span />
          </span>
        </label>
        {form.payment_alert === "1" ? (
          <div className="m-account-alert-grid">
            <FormField label={i18n.alertType}>
              <select value={form.alert_type} onChange={(e) => update("alert_type", e.target.value)}>
                <option value="">{i18n.alertType}</option>
                <option value="weekly">{i18n.weekly}</option>
                <option value="monthly">{i18n.monthly}</option>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {i18n.days.replace("{n}", day)}
                  </option>
                ))}
              </select>
            </FormField>
            <DateTapRow
              label={i18n.startDate}
              value={form.alert_start_date}
              onChange={(value) => update("alert_start_date", value)}
            />
            <FormField label={i18n.alertAmount}>
              <input inputMode="decimal" value={form.alert_amount} onChange={(e) => update("alert_amount", e.target.value)} />
            </FormField>
          </div>
        ) : null}
      </div>
      {!account.groupOnlyMode && account.availableCompanies?.length > 0 ? (
        <div className="m-account-sheet-section">
          <p className="m-account-section-title">{i18n.assignCompanies || i18n.company}</p>
          <div className="m-account-pill-row">
            {account.availableCompanies.map((row) => {
              const id = Number(row.id);
              const active = account.selectedCompanyIds.includes(id);
              const label = String(row.company_code || row.company_id || id).toUpperCase();
              return (
                <Pill
                  key={id}
                  active={active}
                  onClick={() =>
                    account.setSelectedCompanyIds((ids) =>
                      active ? ids.filter((x) => Number(x) !== id) : [...ids, id],
                    )
                  }
                >
                  {label}
                </Pill>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="m-account-sheet-section">
        <p className="m-account-section-title">{i18n.currencies}</p>
        <div className="m-account-pill-row">
          {account.currencies.map((currency) => {
            const active = account.formCurrencies.includes(Number(currency.id));
            return (
              <Pill
                key={currency.id}
                active={active}
                onClick={() =>
                  account.setFormCurrencies((ids) =>
                    active
                      ? ids.filter((id) => Number(id) !== Number(currency.id))
                      : [...ids, Number(currency.id)],
                  )
                }
              >
                {currency.code}
              </Pill>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function FormField({ label, hint = "", children }) {
  return (
    <label className="m-account-form-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function LinkAccountSheet({ open, onClose, account }) {
  const { i18n } = account;
  const [query, setQuery] = useState("");
  const rows = account.linkPool.filter((row) =>
    `${row.account_id || ""} ${row.name || ""}`.toUpperCase().includes(query.toUpperCase()),
  );
  return (
    <Sheet
      open={open}
      title={i18n.linkAccount}
      onClose={onClose}
      tall
      footer={
        <div className="m-account-link-footer">
          <span>{i18n.selectedCount.replace("{count}", account.linkedIds.size)}</span>
          <button
            type="button"
            disabled={account.saving}
            className="m-account-primary-btn tap-scale"
            onClick={async () => {
              if (await account.saveLinks()) onClose();
            }}
          >
            {i18n.link}
          </button>
        </div>
      }
    >
      <div className="m-account-segment">
        {["bidirectional", "unidirectional"].map((type) => (
          <button
            key={type}
            type="button"
            className={account.linkType === type ? "is-active" : ""}
            onClick={() => account.setLinkType(type)}
          >
            {i18n[type]}
          </button>
        ))}
      </div>
      <div className="m-account-sheet-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={i18n.searchAccounts} />
      </div>
      <div className="m-account-check-list">
        {rows.map((row) => (
          <label key={row.id}>
            <input
              type="checkbox"
              checked={account.linkedIds.has(Number(row.id))}
              onChange={(e) =>
                account.setLinkedIds((ids) => {
                  const next = new Set(ids);
                  if (e.target.checked) next.add(Number(row.id));
                  else next.delete(Number(row.id));
                  return next;
                })
              }
            />
            <span className="m-account-avatar">{String(row.account_id || "A").slice(0, 2)}</span>
            <span>
              <strong>{row.account_id}</strong>
              <small>{row.name || row.role}</small>
            </span>
            <em>{row.role}</em>
          </label>
        ))}
      </div>
    </Sheet>
  );
}

export function CurrencySettingSheet({ open, onClose, account }) {
  const { i18n } = account;
  const [newCode, setNewCode] = useState("");
  useEffect(() => {
    if (!open) setNewCode("");
  }, [open]);
  const selectedIds = account.settingCurrencyIds instanceof Set ? account.settingCurrencyIds : new Set();
  const hasSelectedCurrency = selectedIds.size > 0;
  const canSave = hasSelectedCurrency && (account.currencyLinked.size > 0 || account.currencyInitial.size > 0);
  const toggleCurrency = (id) => {
    const nid = Number(id);
    account.setSettingCurrencyIds((prev) => {
      const next = new Set(prev);
      if (next.has(nid)) next.delete(nid);
      else next.add(nid);
      return next;
    });
  };
  return (
    <Sheet
      open={open}
      title={i18n.currencySetting}
      onClose={onClose}
      tall
      footer={
        <button
          type="button"
          disabled={!canSave || account.saving}
          className="m-account-primary-btn tap-scale"
          onClick={async () => {
            if (await account.saveCurrencyLinks()) onClose();
          }}
        >
          {account.saving ? i18n.saving : i18n.save}
        </button>
      }
    >
      <p className="m-account-currency-hint">{i18n.currencyMatchHint}</p>
      <div className="m-account-currency-create">
        <input
          value={newCode}
          maxLength={8}
          onChange={(e) => setNewCode(e.target.value)}
          style={{ textTransform: "uppercase" }}
          placeholder={i18n.newCurrency}
        />
        <button
          type="button"
          disabled={!newCode.trim()}
          onClick={async () => {
            if (await account.createCurrency(newCode)) setNewCode("");
          }}
        >
          <i className="fas fa-plus" aria-hidden="true" /> {i18n.createCurrency}
        </button>
      </div>
      <div className="m-account-currency-tags">
        {account.currencies.map((currency) => {
          const id = Number(currency.id);
          const active = selectedIds.has(id);
          return (
            <span key={currency.id} className={active ? "is-active" : ""}>
              <button
                type="button"
                className={`m-account-currency-pill tap-scale${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => toggleCurrency(id)}
              >
                {currency.code}
              </button>
              <button
                type="button"
                disabled={currency.deletable === false}
                onClick={() => {
                  const message = i18n.deleteCurrencyConfirm.replace("{code}", currency.code);
                  if (window.confirm(message)) account.deleteCurrency(currency);
                }}
                aria-label={`${i18n.delete} ${currency.code}`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="m-account-check-list">
        {account.accounts.map((row) => (
          <label key={row.id} className={!hasSelectedCurrency ? "is-disabled" : ""}>
            <input
              type="checkbox"
              disabled={!hasSelectedCurrency}
              checked={account.currencyLinked.has(Number(row.id))}
              onChange={(e) =>
                account.setCurrencyLinked((ids) => {
                  const next = new Set(ids);
                  if (e.target.checked) next.add(Number(row.id));
                  else next.delete(Number(row.id));
                  return next;
                })
              }
            />
            <span className="m-account-avatar">{String(row.account_id || "A").slice(0, 2)}</span>
            <span><strong>{row.account_id}</strong><small>{row.name || row.role}</small></span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}
