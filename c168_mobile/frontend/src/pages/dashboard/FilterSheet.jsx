import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  defaultDashboardDateRange,
  formatDisplayDate,
  formatYmd,
  parseYmd,
  periodPresetRange,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import { fetchMobileCurrencyCodes } from "../../lib/dashboardCurrencies.js";
import { companiesForPicker as resolveCompaniesForPicker, pickCompany, resolveCompanyPickForGroup } from "../../lib/dashboardScope.js";
import {
  companyLoginCanUseGroupsAllLedger,
  isCompanyLogin,
  isGroupLogin,
} from "../../lib/loginScope.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";

/** Group/Company/All identity — detect draft scope switches for currency reset. */
export function buildGcScopeIdentity({ companyId, selectedGroup, groupAllMode, groupsAllMode }) {
  const cid = Number.isFinite(Number(companyId)) && Number(companyId) > 0 ? String(Number(companyId)) : "";
  return [
    cid,
    String(selectedGroup || "").toUpperCase(),
    groupAllMode ? "1" : "0",
    groupsAllMode ? "1" : "0",
  ].join("|");
}

/** Mirror useMobileDashboard.pickAllGroups for Filter draft. */
export function resolveGroupsAllDraft(dash, prev) {
  const me = dash.me;
  const companyGroupsAllLedger = companyLoginCanUseGroupsAllLedger(me);
  const companyLoginGroupsAll =
    isCompanyLogin(me) && !isGroupLogin(me) && !companyGroupsAllLedger;
  let preserveCompanyId = null;
  if (companyLoginGroupsAll) {
    const fromDraft = prev?.companyId != null ? Number(prev.companyId) : NaN;
    const fromDash = dash.companyId != null ? Number(dash.companyId) : NaN;
    const fromMe = me?.company_id != null ? Number(me.company_id) : NaN;
    if (Number.isFinite(fromDraft) && fromDraft > 0) preserveCompanyId = fromDraft;
    else if (Number.isFinite(fromDash) && fromDash > 0) preserveCompanyId = fromDash;
    else if (Number.isFinite(fromMe) && fromMe > 0) preserveCompanyId = fromMe;
    else {
      const first = resolveCompaniesForPicker(dash.companies, {
        selectedGroup: null,
        groupsAllMode: true,
      })[0];
      const firstId = first?.id != null ? Number(first.id) : NaN;
      if (Number.isFinite(firstId) && firstId > 0) preserveCompanyId = firstId;
    }
  }
  const useCompanyAllAggregate = companyLoginGroupsAll && !preserveCompanyId;
  const groupLoginAllGroupsAggregate =
    isGroupLogin(me) && !companyGroupsAllLedger && !useCompanyAllAggregate;
  const nextGroupAllMode = companyGroupsAllLedger
    ? false
    : useCompanyAllAggregate || groupLoginAllGroupsAggregate;
  const nextCompanyId = companyGroupsAllLedger
    ? null
    : companyLoginGroupsAll && !useCompanyAllAggregate
      ? preserveCompanyId
      : null;
  return {
    groupsAllMode: true,
    groupAllMode: nextGroupAllMode,
    selectedGroup: null,
    companyId: nextCompanyId,
  };
}

export function Pill({ active, disabled, onClick, block, tone = "blue", children }) {
  const activeMod =
    tone === "violet" ? "m-filter-pill--active-violet" : "m-filter-pill--active-blue";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`m-filter-pill tap-scale${block ? " m-filter-pill--block" : " m-filter-pill--inline"}${
        active ? ` ${activeMod}` : ""
      }`}
    >
      {children}
    </button>
  );
}

export function Section({ title, trailing, children }) {
  return (
    <div className="m-filter-section">
      <div className="m-filter-section-head">
        <p className="m-filter-section-title">{title}</p>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export function DateRangeRow({ fromLabel, toLabel, dateFrom, dateTo, active, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`m-filter-range-row tap-scale${active ? " m-filter-range-row--active" : ""}`}
      aria-label={`${fromLabel} ${dateFrom ? formatDisplayDate(dateFrom) : "—"} · ${toLabel} ${dateTo ? formatDisplayDate(dateTo) : "—"}`}
    >
      <span className="m-filter-range-icon">
        <i className="far fa-calendar" aria-hidden="true" />
      </span>
      <span className="m-filter-range-fields">
        <span className="m-filter-range-field">
          <span className="m-filter-range-label">{fromLabel}</span>
          <span className="m-filter-range-value">{dateFrom ? formatDisplayDate(dateFrom) : "—"}</span>
        </span>
        <span className="m-filter-range-field">
          <span className="m-filter-range-label">{toLabel}</span>
          <span className="m-filter-range-value">{dateTo ? formatDisplayDate(dateTo) : "—"}</span>
        </span>
      </span>
      <span className="m-filter-range-chevron">
        <i className="fas fa-chevron-right" aria-hidden="true" />
      </span>
    </button>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function cmpYmd(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function inRangeYmd(day, from, to) {
  if (!day || !from || !to) return false;
  const lo = cmpYmd(from, to) <= 0 ? from : to;
  const hi = cmpYmd(from, to) <= 0 ? to : from;
  return cmpYmd(day, lo) >= 0 && cmpYmd(day, hi) <= 0;
}

export function resolveDraftCurrencies(dash) {
  const fallback = String(dash.currencies?.[0] || "MYR").toUpperCase();
  if (Array.isArray(dash.selectedCurrencies) && dash.selectedCurrencies.length) {
    const picked = dash.selectedCurrencies
      .map((c) => String(c || "").toUpperCase())
      .filter((c) => c && c !== "ALL");
    if (picked.length) return picked;
  }
  const code = String(dash.currency || "").toUpperCase();
  if (!code || code === "ALL") return [fallback];
  return [code];
}

export function buildDraftFromDash(dash) {
  return {
    dateFrom: dash.dateFrom,
    dateTo: dash.dateTo,
    activePreset: dash.activePreset || "",
    selectedGroup: dash.selectedGroup,
    groupsAllMode: dash.groupsAllMode,
    groupAllMode: dash.groupAllMode,
    companyId: dash.companyId,
    currency: dash.currency,
    selectedCurrencies: resolveDraftCurrencies(dash),
    selectedCategories: Array.isArray(dash.selectedCategories) ? [...dash.selectedCategories] : [],
  };
}

export function buildDefaultDraft(dash) {
  const txMode = Array.isArray(dash.categories);
  // Transaction Capture Date → today; Dashboard matches first paint → This Month.
  const preset = txMode ? "today" : "thisMonth";
  const range = periodPresetRange(preset) || defaultDashboardDateRange();
  const fallback = pickCompany(dash.companies, dash.me?.company_id);
  return {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    activePreset: preset,
    selectedGroup: null,
    groupsAllMode: false,
    groupAllMode: false,
    companyId: fallback?.id ?? null,
    currency: dash.currencies?.[0] || dash.currency || "MYR",
    // Transaction: at least one currency (never ALL). Dashboard uses single `currency`.
    selectedCurrencies: txMode
      ? [String(dash.currencies?.[0] || dash.currency || "MYR").toUpperCase()]
      : [],
    selectedCategories: [],
  };
}

export function draftGroupOnlyMode(draft) {
  const hasCompany = Number.isFinite(Number(draft.companyId)) && Number(draft.companyId) > 0;
  return Boolean(draft.selectedGroup && !draft.groupAllMode && !draft.groupsAllMode && !hasCompany);
}

export function DateRangeCalendarSheet({ open, onClose, dateFrom, dateTo, maxYmd, labels, onApply }) {
  const [cursor, setCursor] = useState(() => parseYmd(dateFrom || maxYmd || todayYmd()));
  const [draftFrom, setDraftFrom] = useState(dateFrom || "");
  const [draftTo, setDraftTo] = useState(dateTo || "");
  const [picking, setPicking] = useState("start");

  useEffect(() => {
    if (!open) return;
    setDraftFrom(dateFrom || "");
    setDraftTo(dateTo || "");
    setPicking("start");
    setCursor(parseYmd(dateFrom || maxYmd || todayYmd()));
  }, [open, dateFrom, dateTo, maxYmd]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const monthLabel = cursor.toLocaleString("en", { month: "long", year: "numeric" });

  const commitRange = (from, to) => {
    if (!from || !to) return;
    let lo = from;
    let hi = to;
    if (cmpYmd(hi, lo) < 0) {
      const tmp = lo;
      lo = hi;
      hi = tmp;
    }
    onApply?.(lo, hi);
    onClose?.();
  };

  const pickDay = (dayNum) => {
    if (!dayNum) return;
    const ymd = formatYmd(new Date(year, month, dayNum));
    if (maxYmd && cmpYmd(ymd, maxYmd) > 0) return;

    if (picking === "start" || !draftFrom) {
      setDraftFrom(ymd);
      setDraftTo("");
      setPicking("end");
      return;
    }

    commitRange(draftFrom, ymd);
  };

  const shiftMonth = (delta) => {
    setCursor(new Date(year, month + delta, 1));
  };

  if (!open) return null;

  return (
    <div className="m-sheet-host-flex">
      <button type="button" className="m-sheet-backdrop m-sheet-backdrop--light" aria-label={labels.close} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.selectDateRange}
        className="m-sheet-panel m-sheet-panel--calendar"
      >
        <div className="m-filter-cal-header">
          <div className="min-w-0">
            <p className="m-filter-cal-title">{labels.selectDateRange}</p>
            <p className="m-filter-cal-hint">{labels.rangePickHint}</p>
          </div>
          <button type="button" onClick={onClose} className="m-sheet-close m-sheet-close--square tap-scale" aria-label={labels.close}>
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="m-filter-cal-body">
          <div className="m-filter-cal-draft-grid">
            <div className={`m-filter-cal-draft${picking === "start" ? " m-filter-cal-draft--active" : ""}`}>
              <p className="m-filter-cal-draft-label">{labels.from}</p>
              <p className="m-filter-cal-draft-value">{draftFrom ? formatDisplayDate(draftFrom) : "—"}</p>
            </div>
            <div className={`m-filter-cal-draft${picking === "end" ? " m-filter-cal-draft--active" : ""}`}>
              <p className="m-filter-cal-draft-label">{labels.toDate}</p>
              <p className="m-filter-cal-draft-value">{draftTo ? formatDisplayDate(draftTo) : "—"}</p>
            </div>
          </div>

          <div className="m-filter-cal-nav">
            <button type="button" onClick={() => shiftMonth(-1)} className="m-filter-cal-nav-btn tap-scale" aria-label="Previous month">
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <p className="m-filter-cal-month">{monthLabel}</p>
            <button type="button" onClick={() => shiftMonth(1)} className="m-filter-cal-nav-btn tap-scale" aria-label="Next month">
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <div className="m-filter-cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="m-filter-cal-weekday">
                {w}
              </span>
            ))}
          </div>
          <div className="m-filter-cal-grid">
            {cells.map((dayNum, idx) => {
              if (!dayNum) return <span key={`e-${idx}`} />;
              const ymd = formatYmd(new Date(year, month, dayNum));
              const disabled = Boolean(maxYmd && cmpYmd(ymd, maxYmd) > 0);
              const isStart = draftFrom && ymd === draftFrom;
              const isEnd = draftTo && ymd === draftTo;
              const inMid = draftFrom && draftTo && inRangeYmd(ymd, draftFrom, draftTo) && !isStart && !isEnd;
              let dayMod = "";
              if (disabled) dayMod = " m-filter-cal-day--disabled";
              else if (isStart || isEnd) dayMod = " m-filter-cal-day--edge";
              else if (inMid) dayMod = " m-filter-cal-day--mid";
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(dayNum)}
                  className={`m-filter-cal-day tap-scale${dayMod}`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>

        <div className="m-filter-cal-footer">
          <button
            type="button"
            onClick={() => {
              setDraftFrom("");
              setDraftTo("");
              setPicking("start");
            }}
            className="m-filter-cal-footer-btn tap-scale"
          >
            {labels.clear}
          </button>
          <button
            type="button"
            onClick={() => {
              const t = maxYmd || todayYmd();
              commitRange(t, t);
            }}
            className="m-filter-cal-footer-btn tap-scale"
          >
            {labels.today}
          </button>
          <button
            type="button"
            disabled={!draftFrom || !draftTo}
            onClick={() => commitRange(draftFrom, draftTo)}
            className="m-filter-cal-footer-btn m-filter-cal-footer-btn--primary tap-scale"
          >
            {labels.done}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FilterSheet({ open, onClose, dash }) {
  const { i18n } = dash;
  const bodyRef = useRef(null);
  const appliedGcIdentityRef = useRef("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draft, setDraft] = useState(() => buildDraftFromDash(dash));
  const [draftCurrencies, setDraftCurrencies] = useState(() =>
    Array.isArray(dash.currencies) && dash.currencies.length ? [...dash.currencies] : ["MYR"],
  );
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) {
      setRangeOpen(false);
      return;
    }
    const next = buildDraftFromDash(dash);
    setDraft(next);
    appliedGcIdentityRef.current = buildGcScopeIdentity(next);
    setDraftCurrencies(
      Array.isArray(dash.currencies) && dash.currencies.length ? [...dash.currencies] : ["MYR"],
    );
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [open]);

  // Desktop parity: currency pills follow draft Group/Company (not only applied dash.currencies).
  useEffect(() => {
    if (!open) return undefined;
    const companies = Array.isArray(dash.companies) ? dash.companies : [];
    if (!companies.length) return undefined;

    const hasCompany = Number.isFinite(Number(draft.companyId)) && Number(draft.companyId) > 0;
    const groupOnly = Boolean(
      draft.selectedGroup && !draft.groupAllMode && !draft.groupsAllMode && !hasCompany,
    );
    if (!hasCompany && !groupOnly && !draft.groupsAllMode && !draft.groupAllMode) {
      return undefined;
    }

    const draftIdentity = buildGcScopeIdentity(draft);
    const scopeChanged =
      Boolean(appliedGcIdentityRef.current) && appliedGcIdentityRef.current !== draftIdentity;
    const txMode = Array.isArray(dash.categories);
    const ac = new AbortController();

    (async () => {
      try {
        const codes = await fetchMobileCurrencyCodes({
          companyId: draft.companyId,
          selectedGroup: draft.selectedGroup,
          groupAllMode: draft.groupAllMode,
          groupsAllMode: draft.groupsAllMode,
          companies,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        const next = codes.length ? codes : ["MYR"];
        setDraftCurrencies(next);
        setDraft((prev) => {
          if (scopeChanged) {
            const first = next[0] || "MYR";
            return {
              ...prev,
              currency: first,
              selectedCurrencies: txMode ? [first] : prev.selectedCurrencies,
            };
          }
          const prevCode = String(prev.currency || "").toUpperCase();
          if (txMode) {
            const kept = (prev.selectedCurrencies || [])
              .map((c) => String(c || "").toUpperCase())
              .filter((c) => next.includes(c));
            const selectedCurrencies = kept.length ? kept : [next[0] || "MYR"];
            return {
              ...prev,
              selectedCurrencies,
              currency: selectedCurrencies[0] || next[0] || "MYR",
            };
          }
          return {
            ...prev,
            currency: next.includes(prevCode) ? prevCode : next[0] || "MYR",
          };
        });
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setDraftCurrencies((prev) => (prev.length ? prev : ["MYR"]));
      }
    })();

    return () => ac.abort();
  }, [
    open,
    dash.companies,
    dash.categories,
    draft.companyId,
    draft.selectedGroup,
    draft.groupAllMode,
    draft.groupsAllMode,
  ]);

  const canUseGroupOnly = dash.canUseGroupOnlyForGroup || (() => false);

  const companiesForPicker = useMemo(
    () =>
      resolveCompaniesForPicker(dash.companies, {
        selectedGroup: draft.selectedGroup,
        groupsAllMode: draft.groupsAllMode,
        preferredCompanyId: draft.companyId,
      }),
    [dash.companies, draft.selectedGroup, draft.groupsAllMode, draft.companyId],
  );

  const pickDraftGroup = useCallback(
    (gid) => {
      const group = String(gid || "").trim().toUpperCase();
      if (!group) return;
      const allowGroupOnly = canUseGroupOnly(group);
      const pick = allowGroupOnly ? null : resolveCompanyPickForGroup(dash.companies, group, draft.companyId);
      setDraft((prev) => ({
        ...prev,
        selectedGroup: group,
        groupsAllMode: false,
        groupAllMode: false,
        companyId: allowGroupOnly ? null : (pick?.id ?? prev.companyId),
      }));
    },
    [canUseGroupOnly, dash.companies, draft.companyId],
  );

  const handleReset = () => {
    setDraft(buildDefaultDraft(dash));
  };

  const handleApply = () => {
    if (typeof dash.applyFilters === "function") {
      void dash.applyFilters(draft);
    }
    onClose?.();
  };

  const maxDay = todayYmd();
  const span = daysInclusive(draft.dateFrom, draft.dateTo);
  const daysLabel = (i18n.daysCount || "{n} days").replace("{n}", String(span));
  const groupOnlyDraft = draftGroupOnlyMode(draft);
  const showGroupOnlyHint = dash.groupIds?.some((gid) => canUseGroupOnly(gid));

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

          {dash.groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="m-filter-pill-wrap">
                <Pill
                  tone="violet"
                  active={draft.groupsAllMode}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      ...resolveGroupsAllDraft(dash, prev),
                    }))
                  }
                >
                  {i18n.all}
                </Pill>
                {dash.groupIds.map((gid) => (
                  <Pill
                    key={gid}
                    tone="violet"
                    active={draft.selectedGroup === gid && !draft.groupsAllMode}
                    onClick={() => pickDraftGroup(gid)}
                  >
                    {gid}
                  </Pill>
                ))}
              </div>
              <p className="m-filter-hint">
                {showGroupOnlyHint
                  ? i18n.groupHint || "Tap a group for group-only · Company All aggregates companies"
                  : i18n.groupCompanyHint || "Pick a group, then choose a company"}
              </p>
            </Section>
          )}

          <Section title={i18n.company}>
            <div className="m-filter-pill-wrap">
              {(companiesForPicker.length > 1 || draft.selectedGroup || draft.groupsAllMode) && (
                <Pill
                  active={draft.groupAllMode}
                  disabled={!draft.selectedGroup && !draft.groupsAllMode}
                  onClick={() =>
                    setDraft((prev) => {
                      // Desktop: Company All under Groups All keeps both flags.
                      if (prev.groupsAllMode) {
                        return {
                          ...prev,
                          groupAllMode: true,
                          selectedGroup: null,
                          companyId: null,
                        };
                      }
                      return {
                        ...prev,
                        groupAllMode: true,
                        groupsAllMode: false,
                        companyId:
                          Number.isFinite(Number(prev.companyId)) && Number(prev.companyId) > 0
                            ? prev.companyId
                            : (resolveCompanyPickForGroup(
                                dash.companies,
                                prev.selectedGroup,
                                prev.companyId,
                              )?.id ?? null),
                      };
                    })
                  }
                >
                  {i18n.all}
                </Pill>
              )}
              {companiesForPicker.map((c) => {
                const label = String(c.company_id || c.name || c.id).toUpperCase();
                const draftRow = dash.companies.find((row) => Number(row.id) === Number(draft.companyId));
                const draftCode = String(draftRow?.company_id || "").trim().toUpperCase();
                const active =
                  !draft.groupAllMode &&
                  !groupOnlyDraft &&
                  (Number(draft.companyId) === Number(c.id) || (draftCode && draftCode === label));
                return (
                  <Pill
                    key={label}
                    active={active}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        groupAllMode: false,
                        groupsAllMode: false,
                        companyId: c.id,
                        selectedGroup:
                          prev.selectedGroup ||
                          (c.group_id ? String(c.group_id).trim().toUpperCase() : null),
                      }))
                    }
                  >
                    {label}
                  </Pill>
                );
              })}
            </div>
          </Section>

          {draftCurrencies.length > 0 && (
            <Section title={i18n.currency}>
              <div className="m-filter-pill-scroll">
                {Array.isArray(dash.categories) ? (
                  <>
                    {draftCurrencies.map((code) => {
                      const active = draft.selectedCurrencies.includes(code);
                      return (
                        <Pill
                          key={code}
                          active={active}
                          onClick={() =>
                            setDraft((prev) => {
                              const set = new Set(prev.selectedCurrencies);
                              if (set.has(code)) {
                                if (set.size <= 1) return prev; // keep ≥1 currency
                                set.delete(code);
                              } else {
                                set.add(code);
                              }
                              const next = [...set];
                              return {
                                ...prev,
                                selectedCurrencies: next,
                                currency: next[0] || code,
                              };
                            })
                          }
                        >
                          {code}
                        </Pill>
                      );
                    })}
                  </>
                ) : (
                  draftCurrencies.map((code) => (
                    <Pill
                      key={code}
                      active={draft.currency === code}
                      onClick={() => setDraft((prev) => ({ ...prev, currency: code }))}
                    >
                      {code}
                    </Pill>
                  ))
                )}
              </div>
            </Section>
          )}

          {Array.isArray(dash.categories) && dash.categories.length > 0 && (
            <Section title={dash.m?.category || i18n.category || "Category"}>
              <div className="m-filter-pill-wrap">
                <Pill
                  active={draft.selectedCategories.length === 0}
                  onClick={() => setDraft((prev) => ({ ...prev, selectedCategories: [] }))}
                >
                  {i18n.all}
                </Pill>
                {dash.categories.map((cat) => {
                  const value =
                    typeof cat === "string"
                      ? cat.trim()
                      : String(cat?.value ?? cat?.id ?? cat?.name ?? "").trim();
                  const label =
                    typeof cat === "string"
                      ? value
                      : String(cat?.label ?? cat?.name ?? value).trim() || value;
                  if (!value) return null;
                  const active = draft.selectedCategories.includes(value);
                  return (
                    <Pill
                      key={value}
                      active={active}
                      onClick={() =>
                        setDraft((prev) => {
                          const has = prev.selectedCategories.includes(value);
                          return {
                            ...prev,
                            selectedCategories: has
                              ? prev.selectedCategories.filter((x) => x !== value)
                              : [...prev.selectedCategories, value],
                          };
                        })
                      }
                    >
                      {label}
                    </Pill>
                  );
                })}
              </div>
            </Section>
          )}
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
