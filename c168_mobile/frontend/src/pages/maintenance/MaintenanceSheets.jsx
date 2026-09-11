import { useEffect, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  formatRangeLabel,
  periodPresetRange,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import {
  companiesForPicker,
  resolveCompanyPickForGroup,
} from "../../lib/dashboardScope.js";
import { fetchMaintenanceProcessOptions } from "../../lib/maintenanceApi.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";
import {
  DateRangeCalendarSheet,
  DateRangeRow,
  Pill,
  Section,
} from "../dashboard/FilterSheet.jsx";
import { MiniSheet } from "../dashboard/FilterChips.jsx";
import ScopeBreadcrumb from "../dashboard/ScopeBreadcrumb.jsx";
import "../dashboard/filter-chips.css";

export function MaintenanceSearchBar({ value, onChange, placeholder, clearAriaLabel }) {
  return (
    <label className="m-mt-search">
      <i className="fas fa-magnifying-glass" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearAriaLabel || "Clear"}
        >
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}

/**
 * Dashboard/Transaction-style sticky filter bar: one button (date range +
 * scope breadcrumb + Switch) opening the unified maintenance filter sheet.
 */
export function MaintenanceFilterBar({
  i18n,
  dateFrom,
  dateTo,
  groupMode,
  groupsAllMode = false,
  selectedGroup,
  selectedCompany,
  onOpen,
}) {
  const groupId = String(
    (groupsAllMode ? "" : groupMode ? selectedGroup : selectedCompany?.group_id) || "",
  )
    .trim()
    .toUpperCase();
  const companyCode =
    groupsAllMode || groupMode
      ? ""
      : String(selectedCompany?.company_id || "").trim().toUpperCase();

  return (
    <button type="button" onClick={onOpen} className="m-filter-bar tap-scale" aria-label={i18n.filter}>
      <div className="m-filter-bar-row">
        <i className="far fa-calendar m-filter-bar-icon" aria-hidden="true" />
        <span className="m-filter-bar-dates">{formatRangeLabel(dateFrom, dateTo)}</span>
      </div>
      <div className="m-filter-bar-scope m-filter-bar-scope-row">
        <div className="m-filter-bar-scope-main">
          <ScopeBreadcrumb
            i18n={i18n}
            groupId={groupId}
            companyCode={companyCode}
            groupsAllMode={groupsAllMode}
            groupOnlyMode={groupMode && !groupsAllMode}
          />
        </div>
      </div>
    </button>
  );
}

function buildDraft({
  dateFrom,
  dateTo,
  activePreset,
  groupMode,
  selectedGroup,
  companyId,
  process,
  transactionType,
  currency = "",
  statusFilters = null,
}) {
  return {
    dateFrom,
    dateTo,
    activePreset: activePreset || "",
    groupMode: Boolean(groupMode),
    groupId: selectedGroup || null,
    companyId: companyId ?? null,
    process: process ?? "",
    transactionType: transactionType ?? "",
    currency: currency ?? "",
    statusFilters: statusFilters
      ? { ...statusFilters }
      : {
          showActive: true,
          showInactive: false,
          showOfficial: false,
          showEInvoice: false,
          showBlock: false,
        },
  };
}

function draftScope(draft) {
  if (draft.groupMode && draft.groupId) {
    return { mode: "group", companyId: null, groupId: draft.groupId };
  }
  const cid = Number(draft.companyId);
  return { mode: "company", companyId: Number.isFinite(cid) && cid > 0 ? cid : null, groupId: draft.groupId };
}

/**
 * Unified maintenance filter sheet — mirrors dashboard/transaction FilterSheet
 * (date range + quick select + group/company + apply), plus maintenance-only
 * sections: Process (transaction) or Transaction type (payment).
 *
 * `section` splits the same sheet into the dashboard-style chip flow:
 *   "date"  → only date range + quick select (date chip)
 *   "scope" → only group/company pills (scope chip)
 *   "full"  → everything (legacy single-sheet usage)
 */
export function MaintenanceFilterSheet({
  open,
  onClose,
  i18n,
  section = "full",
  dateFrom,
  dateTo,
  activePreset = "",
  groupMode = false,
  selectedGroup = null,
  companyId = null,
  companies = [],
  groupIds = [],
  allowedGroupIds = [],
  withProcess = false,
  process = "",
  types = null,
  transactionType = "",
  readOnlyNote = false,
  readOnlyNoteText = "",
  /** Bank Process: currency codes + status chip draft */
  currencies = null,
  currency = "",
  statusFilters = null,
  withBankStatus = false,
  onApply,
}) {
  const bodyRef = useRef(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    buildDraft({
      dateFrom,
      dateTo,
      activePreset,
      groupMode,
      selectedGroup,
      companyId,
      process,
      transactionType,
      currency,
      statusFilters,
    }),
  );
  const [processOptions, setProcessOptions] = useState([]);
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) {
      setRangeOpen(false);
      return;
    }
    setDraft(
      buildDraft({
        dateFrom,
        dateTo,
        activePreset,
        groupMode,
        selectedGroup,
        companyId,
        process,
        transactionType,
        currency,
        statusFilters,
      }),
    );
    bodyRef.current?.scrollTo?.({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Process options follow the draft scope. */
  const scope = draftScope(draft);
  const scopeKey = `${scope.mode}:${scope.companyId ?? ""}:${scope.groupId ?? ""}`;
  useEffect(() => {
    if (!open || !withProcess) return undefined;
    const ac = new AbortController();
    fetchMaintenanceProcessOptions({
      scope: draftScope(draft),
      signal: ac.signal,
    })
      .then((names) => setProcessOptions(names))
      .catch((e) => {
        if (e?.name !== "AbortError") setProcessOptions([]);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withProcess, scopeKey]);

  /** Dashboard parity: company pills follow the selected group. */
  const pickable = companiesForPicker(companies, {
    selectedGroup: draft.groupId,
    groupsAllMode: false,
    preferredCompanyId: draft.companyId,
  });

  /**
   * Dashboard parity: tap a group → group ledger when allowed, otherwise
   * auto-pick a company inside that group (company mode).
   */
  const pickDraftGroup = (gid) => {
    setDraft((prev) => {
      if (allowedGroupIds.includes(gid)) {
        return { ...prev, groupMode: true, groupId: gid, process: "" };
      }
      const pick = resolveCompanyPickForGroup(companies, gid, prev.companyId);
      return {
        ...prev,
        groupMode: false,
        groupId: gid,
        companyId: pick?.id ?? prev.companyId,
        process: "",
      };
    });
  };

  const handleReset = () => {
    const t = todayYmd();
    setDraft((prev) => ({
      ...prev,
      dateFrom: t,
      dateTo: t,
      activePreset: "today",
      process: "",
      transactionType: "",
      currency: "",
      statusFilters: {
        showActive: true,
        showInactive: false,
        showOfficial: false,
        showEInvoice: false,
        showBlock: false,
      },
    }));
  };

  const toggleStatus = (key) => {
    setDraft((prev) => ({
      ...prev,
      statusFilters: {
        ...prev.statusFilters,
        [key]: !prev.statusFilters?.[key],
      },
    }));
  };

  const handleApply = () => {
    onApply?.({
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      activePreset: draft.activePreset,
      scope: draftScope(draft),
      process: draft.process,
      transactionType: draft.transactionType,
      currency: draft.currency ?? "",
      statusFilters: draft.statusFilters,
    });
    onClose?.();
  };

  const maxDay = todayYmd();
  const span = daysInclusive(draft.dateFrom, draft.dateTo);
  const daysLabel = (i18n.daysCount || "{n} days").replace("{n}", String(span));
  const showDate = section === "full" || section === "date";
  const showScope = section === "full" || section === "scope";
  const showExtras = section === "full";

  return (
    <div
      className={`m-sheet-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" aria-label="Close filter" onClick={onClose} className="m-sheet-backdrop" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.filter}
        className={`m-sheet-panel${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>

        <div className="m-sheet-header">
          <h2 className="m-sheet-title">{i18n.filter}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="m-sheet-close tap-scale">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="m-sheet-body m-sheet-body--spaced">
          {showDate && (
            <Section
              title={i18n.dateRange}
              trailing={
                span > 0 ? (
                  <span
                    className={`m-filter-span-badge${
                      draft.activePreset ? " m-filter-span-badge--preset" : " m-filter-span-badge--custom"
                    }`}
                  >
                    {draft.activePreset ? daysLabel : `${i18n.customRange} · ${daysLabel}`}
                  </span>
                ) : null
              }
            >
              <DateRangeRow
                fromLabel={i18n.from}
                toLabel={i18n.toDate}
                dateFrom={draft.dateFrom}
                dateTo={draft.dateTo}
                active={rangeOpen}
                onOpen={() => setRangeOpen(true)}
              />
            </Section>
          )}

          {showDate && (
            <Section title={i18n.quickSelect}>
              <div className="m-filter-pill-wrap">
                {PERIOD_PRESET_KEYS.map((key) => (
                  <Pill
                    key={key}
                    active={draft.activePreset === key}
                    onClick={() => {
                      const range = periodPresetRange(key);
                      if (!range) return;
                      setDraft((prev) => ({
                        ...prev,
                        activePreset: key,
                        dateFrom: range.dateFrom,
                        dateTo: range.dateTo,
                      }));
                    }}
                  >
                    {dashboardLabel(i18n, key)}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {showScope && groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="m-filter-pill-wrap">
                {groupIds.map((gid) => (
                  <Pill
                    key={gid}
                    tone="violet"
                    active={draft.groupId === gid}
                    onClick={() => pickDraftGroup(gid)}
                  >
                    {gid}
                  </Pill>
                ))}
              </div>
              <p className="m-filter-hint">
                {allowedGroupIds.length > 0
                  ? i18n.groupHint || "Tap a group for group-only · pick a company below"
                  : i18n.groupCompanyHint || "Pick a group, then choose a company"}
              </p>
            </Section>
          )}

          {showScope && (
            <Section title={i18n.company}>
            <div className="m-filter-pill-wrap">
              {pickable.map((c) => {
                const label = String(c.company_id).toUpperCase();
                const draftRow = companies.find((row) => Number(row.id) === Number(draft.companyId));
                const draftCode = String(draftRow?.company_id || "").trim().toUpperCase();
                const active =
                  !draft.groupMode &&
                  (Number(draft.companyId) === Number(c.id) || (draftCode && draftCode === label));
                return (
                  <Pill
                    key={label}
                    active={active}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        groupMode: false,
                        companyId: c.id,
                        groupId: c.group_id ? String(c.group_id).trim().toUpperCase() : null,
                        process: "",
                      }))
                    }
                  >
                    {label}
                  </Pill>
                );
              })}
            </div>
          </Section>
          )}

          {showExtras && withProcess && (
            <Section title={i18n.process}>
              <label className="m-mt-field">
                <select
                  value={draft.process}
                  onChange={(e) => setDraft((prev) => ({ ...prev, process: e.target.value }))}
                >
                  <option value="">{i18n.allProcesses}</option>
                  {processOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </Section>
          )}

          {showExtras && Array.isArray(types) && types.length > 0 && (
            <Section title={i18n.transactionType}>
              <div className="m-filter-pill-scroll">
                <Pill
                  active={draft.transactionType === ""}
                  onClick={() => setDraft((prev) => ({ ...prev, transactionType: "" }))}
                >
                  {i18n.allTypes}
                </Pill>
                {types.map((t) => (
                  <Pill
                    key={t}
                    active={draft.transactionType === t}
                    onClick={() => setDraft((prev) => ({ ...prev, transactionType: t }))}
                  >
                    {t}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {showExtras && withBankStatus ? (
            <Section title={i18n.bankStatus || i18n.status || "Status"}>
              <div className="m-filter-pill-wrap">
                <Pill active={!!draft.statusFilters?.showActive} onClick={() => toggleStatus("showActive")}>
                  {i18n.bankShowActive}
                </Pill>
                <Pill active={!!draft.statusFilters?.showInactive} onClick={() => toggleStatus("showInactive")}>
                  {i18n.bankShowInactive}
                </Pill>
                <Pill active={!!draft.statusFilters?.showOfficial} onClick={() => toggleStatus("showOfficial")}>
                  {i18n.bankShowOfficial}
                </Pill>
                <Pill active={!!draft.statusFilters?.showEInvoice} onClick={() => toggleStatus("showEInvoice")}>
                  {i18n.bankShowEInvoice}
                </Pill>
                <Pill active={!!draft.statusFilters?.showBlock} onClick={() => toggleStatus("showBlock")}>
                  {i18n.bankShowBlocked}
                </Pill>
              </div>
            </Section>
          ) : null}

          {showExtras && Array.isArray(currencies) && currencies.length > 0 ? (
            <Section title={i18n.currency}>
              <div className="m-filter-pill-wrap">
                <Pill
                  active={!draft.currency}
                  onClick={() => setDraft((prev) => ({ ...prev, currency: "" }))}
                >
                  {i18n.bankAllCurrencies || i18n.allTypes}
                </Pill>
                {currencies.map((code) => (
                  <Pill
                    key={code}
                    active={draft.currency === code}
                    onClick={() => setDraft((prev) => ({ ...prev, currency: code }))}
                  >
                    {code}
                  </Pill>
                ))}
              </div>
            </Section>
          ) : null}

          {showExtras && (readOnlyNote || readOnlyNoteText) ? (
            <p className="m-mt-readonly-note">
              <i className="fas fa-circle-info" aria-hidden="true" />{" "}
              {readOnlyNoteText || i18n.readOnlyNote}
            </p>
          ) : null}
        </div>

        <div className="m-sheet-footer">
          <button type="button" onClick={handleReset} className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale">
            {i18n.reset}
          </button>
          <button type="button" onClick={handleApply} className="m-sheet-footer-btn m-sheet-footer-btn--primary tap-scale">
            {i18n.applyFilter}
          </button>
        </div>
      </div>

      <DateRangeCalendarSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        dateFrom={draft.dateFrom}
        dateTo={draft.dateTo}
        maxYmd={maxDay}
        labels={{
          selectDateRange: i18n.selectDateRange,
          rangePickHint: i18n.rangePickHint,
          from: i18n.from,
          toDate: i18n.toDate,
          today: i18n.today,
          clear: i18n.clear,
          done: i18n.done,
          close: i18n.closeMenu || "Close",
        }}
        onApply={(from, to) =>
          setDraft((prev) => ({
            ...prev,
            dateFrom: from,
            dateTo: to,
            activePreset: "",
          }))
        }
      />
    </div>
  );
}

/* ── Dashboard/transaction-style chips for the sticky bar ────────────────── */

export function MaintenanceDateChip({ i18n, dateFrom, dateTo, onOpen }) {
  return (
    <button type="button" className="m-fchip tap-scale" onClick={onOpen} aria-label={i18n.dateRange}>
      <i className="far fa-calendar m-fchip-icon" aria-hidden="true" />
      <span className="m-fchip-value">{formatRangeLabel(dateFrom, dateTo)}</span>
      <i className="fas fa-chevron-down m-fchip-caret" aria-hidden="true" />
    </button>
  );
}

export function MaintenanceScopeChip({
  i18n,
  groupMode,
  groupsAllMode = false,
  selectedGroup,
  selectedCompany,
  onOpen,
}) {
  const groupId = String(
    (groupsAllMode ? "" : groupMode ? selectedGroup : selectedCompany?.group_id) || "",
  )
    .trim()
    .toUpperCase();
  const companyCode =
    groupsAllMode || groupMode
      ? ""
      : String(selectedCompany?.company_id || "").trim().toUpperCase();
  return (
    <button type="button" className="m-fchip tap-scale" onClick={onOpen} aria-label={i18n.filter}>
      <span className="m-fchip-value">
        <ScopeBreadcrumb
          i18n={i18n}
          groupId={groupId}
          companyCode={companyCode}
          groupsAllMode={groupsAllMode}
          groupOnlyMode={groupMode && !groupsAllMode}
        />
      </span>
      <i className="fas fa-chevron-down m-fchip-caret" aria-hidden="true" />
    </button>
  );
}

/** Transaction type chip — own mini sheet, tap a row to apply instantly. */
export function MaintenanceTypeChip({ i18n, types, value, onChange }) {
  const [open, setOpen] = useState(false);
  useOverlayLock(open, () => setOpen(false));
  const label = value || i18n.allTypes;
  const options = [{ v: "", label: i18n.allTypes }, ...types.map((t) => ({ v: t, label: t }))];

  return (
    <>
      <button type="button" className="m-fchip tap-scale" onClick={() => setOpen(true)} aria-label={i18n.transactionType}>
        <i className="fas fa-shuffle m-fchip-icon" aria-hidden="true" />
        <span className="m-fchip-value">{label}</span>
        <i className="fas fa-chevron-down m-fchip-caret" aria-hidden="true" />
      </button>

      <MiniSheet open={open} onClose={() => setOpen(false)} title={i18n.transactionType}>
        <div className="m-mt-type-list" role="listbox" aria-label={i18n.transactionType}>
          {options.map((opt) => {
            const active = value === opt.v;
            return (
              <button
                key={opt.v || "__all"}
                type="button"
                role="option"
                aria-selected={active}
                className={`m-mt-type-item tap-scale${active ? " is-active" : ""}`}
                onClick={() => {
                  onChange?.(opt.v);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
                {active ? <i className="fas fa-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </MiniSheet>
    </>
  );
}
