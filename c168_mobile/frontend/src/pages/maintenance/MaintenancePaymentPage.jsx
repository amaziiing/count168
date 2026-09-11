import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import MobileSubpageHeader from "../../components/layout/MobileSubpageHeader.jsx";
import { useIncrementalList } from "../../hooks/useIncrementalList.js";
import { useMaintenanceSession } from "../../hooks/useMaintenanceSession.js";
import {
  deletePaymentRecords,
  formatMaintenanceAmount,
  isPaymentRowSelectable,
  paymentRowKey,
  searchPaymentMaintenance,
} from "../../lib/maintenanceApi.js";
import { notifyTransactionListInvalidated } from "../../lib/transactionPaymentLogic.js";
import { formatRangeLabel } from "../../lib/dashboardDateUtils.js";
import { useRealtimeDomain } from "../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../lib/realtime/realtimeEvents.js";
import {
  maintenanceScopeIsReady,
  maintenanceScopeKey,
  todayYmd,
  ymdToDmy,
} from "../../lib/mobileMaintenanceScope.js";
import {
  getMaintenanceText,
  PAYMENT_MAINTENANCE_TYPES,
} from "../../translateFile/maintenanceTranslate.js";
import { DASHBOARD_I18N } from "../../translateFile/dashboardTranslate.js";
import { DateFilterChip } from "../dashboard/FilterChips.jsx";
import { canAccessPaymentMaintenance } from "../../utils/mobilePermissions.js";
import {
  MaintenanceFilterSheet,
  MaintenanceScopeChip,
  MaintenanceSearchBar,
  MaintenanceTypeChip,
} from "./MaintenanceSheets.jsx";
import "./maintenance.css";

const SEARCH_FIELDS = [
  "account",
  "from_account",
  "description",
  "remark",
  "created_by",
  "currency",
  "transaction_type",
  "amount",
];

function matchesQuery(row, q) {
  if (!q) return true;
  return SEARCH_FIELDS.some((f) => String(row?.[f] ?? "").toUpperCase().includes(q));
}

function canDelete(row) {
  return isPaymentRowSelectable(row) && Number(row?.is_deleted) !== 1;
}

/** Desktop parity: bank-process rows prefix descriptions with "Process: ". */
function stripBankProcessDescriptionPrefix(text) {
  const s = String(text || "");
  const m = s.match(/^\s*process:\s*(.*)$/i);
  return m ? m[1].trim() : s;
}

const TYPE_TONE = {
  PAYMENT: "is-blue",
  RECEIVE: "is-green",
  CONTRA: "is-amber",
  CLAIM: "is-teal",
  RATE: "is-violet",
  ADJUSTMENT: "is-slate",
};

export default function MaintenancePaymentPage() {
  const s = useMaintenanceSession({ canAccess: canAccessPaymentMaintenance });
  const { i18n, lang, scope } = s;

  const [dateFrom, setDateFrom] = useState(todayYmd);
  const [dateTo, setDateTo] = useState(todayYmd);
  const [activePreset, setActivePreset] = useState("today");
  const [transactionType, setTransactionType] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** Dashboard DateFilterChip adapter — identical sheet & instant-apply. */
  const dashI18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);
  const dateDash = useMemo(
    () => ({
      dateFrom,
      dateTo,
      activePreset,
      dateRangeText: formatRangeLabel(dateFrom, dateTo),
      lang,
      applyFilters: (next) => {
        setDateFrom(next.dateFrom);
        setDateTo(next.dateTo);
        setActivePreset(next.activePreset || "");
      },
    }),
    [dateFrom, dateTo, activePreset, lang],
  );

  const seqRef = useRef(0);
  const scopeReady = maintenanceScopeIsReady(scope);
  const scopeCacheKey = maintenanceScopeKey(scope);

  const loadList = useCallback(
    async (signal) => {
      if (!scopeReady) return;
      const seq = ++seqRef.current;
      setListLoading(true);
      setListError("");
      try {
        const data = await searchPaymentMaintenance({
          scope,
          dateFrom: ymdToDmy(dateFrom),
          dateTo: ymdToDmy(dateTo),
          transactionType,
          signal,
        });
        if (seq !== seqRef.current) return;
        setRows(data);
        setSelectedIds(new Set());
      } catch (e) {
        if (e?.name === "AbortError" || seq !== seqRef.current) return;
        setListError(e?.message || i18n.loadFailed);
        setRows([]);
      } finally {
        if (seq === seqRef.current) setListLoading(false);
      }
    },
    [scope, scopeReady, dateFrom, dateTo, transactionType, i18n.loadFailed],
  );

  useEffect(() => {
    if (!s.me || !scopeReady) return undefined;
    const ac = new AbortController();
    loadList(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.me, scopeCacheKey, dateFrom, dateTo, transactionType]);

  /* Desktop parity: reload the list on maintenance realtime events. */
  useRealtimeDomain(REALTIME_DOMAINS.MAINTENANCE, () => {
    if (!s.me || !scopeReady) return;
    loadList();
  });

  const displayRows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return rows.filter((r) => matchesQuery(r, q));
  }, [rows, query]);
  const { visible, hasMore, sentinelRef, shown, total } = useIncrementalList(displayRows);

  const toggleRow = useCallback((row) => {
    if (!canDelete(row)) return;
    const id = Number(row.transaction_id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedList = useMemo(
    () => rows.filter((r) => canDelete(r) && selectedIds.has(Number(r.transaction_id))),
    [rows, selectedIds],
  );

  const doDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = [...selectedIds];
      await deletePaymentRecords({ scope, transactionIds: ids });
      notifyTransactionListInvalidated("mobile_payment_maintenance_delete");
      s.notify(getMaintenanceText(lang, "deleteSuccess", { n: ids.length }), "success");
      setConfirmOpen(false);
      await loadList();
    } catch (e) {
      s.notify(e?.message || i18n.deleteFailed, "error");
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, scope, s, lang, i18n.deleteFailed, loadList]);

  const scopeLabel = s.groupMode
    ? s.selectedGroup || i18n.group
    : String(s.selectedCompany?.company_id || "").toUpperCase() || i18n.company;

  const stickyBar = (
    <div className="m-mt-sticky">
      <MobileSubpageHeader
        backTo="/more"
        backAriaLabel={i18n.backToMore || i18n.back || i18n.backToHub}
        title={i18n.payMaintenanceTitle}
      />
      <div className="m-fchip-row">
        <div className="m-fchip-bar">
          <DateFilterChip dash={dateDash} i18n={dashI18n} lang={lang} />
          <MaintenanceScopeChip
            i18n={i18n}
            groupMode={s.groupMode}
            selectedGroup={s.selectedGroup}
            selectedCompany={s.selectedCompany}
            onOpen={() => setScopeSheetOpen(true)}
          />
        </div>
      </div>
      <div className="m-mt-searchrow">
        <MaintenanceTypeChip
          i18n={i18n}
          types={PAYMENT_MAINTENANCE_TYPES}
          value={transactionType}
          onChange={setTransactionType}
        />
        <MaintenanceSearchBar
          value={query}
          onChange={setQuery}
          placeholder={i18n.searchPlaceholder}
          clearAriaLabel={i18n.reset}
        />
      </div>
    </div>
  );

  if (s.blocked) return null;

  const selectedCount = selectedList.length;

  return (
    <MobileShell
      i18n={i18n}
      me={s.me}
      companyCode={scopeLabel}
      onLogout={s.logout}
      onRefresh={() => loadList()}
      refreshing={listLoading}
      stickyBar={stickyBar}
      lang={s.lang}
      onLangChange={s.setLang}
      overlayOpen={scopeSheetOpen || confirmOpen}
      overlay={
        <>
          <MaintenanceFilterSheet
            section="scope"
            open={scopeSheetOpen}
            onClose={() => setScopeSheetOpen(false)}
            i18n={i18n}
            dateFrom={dateFrom}
            dateTo={dateTo}
            activePreset={activePreset}
            groupMode={s.groupMode}
            selectedGroup={s.selectedGroup}
            companyId={s.companyId}
            companies={s.companies}
            groupIds={s.groupIds}
            allowedGroupIds={s.allowedGroupIds}
            transactionType={transactionType}
            onApply={async (next) => {
              const scopeChanged =
                next.scope.mode !== scope?.mode ||
                String(next.scope.groupId ?? "") !== String(scope?.groupId ?? "") ||
                Number(next.scope.companyId ?? 0) !== Number(scope?.companyId ?? 0);
              if (scopeChanged) {
                await s.applyScope(
                  next.scope.mode === "group"
                    ? { mode: "group", groupId: next.scope.groupId }
                    : { mode: "company", companyId: next.scope.companyId },
                );
              }
              setDateFrom(next.dateFrom);
              setDateTo(next.dateTo);
              setActivePreset(next.activePreset);
              setTransactionType(next.transactionType ?? "");
            }}
          />
          <DeleteConfirm
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            i18n={i18n}
            lang={lang}
            items={selectedList}
            deleting={deleting}
            onConfirm={doDelete}
          />
        </>
      }
    >
      <div className="m-mt-content m-mt-content--pay">
        {s.toast ? (
          <div className={`m-mt-toast${s.toast.tone === "error" ? " is-error" : ""}`}>
            {s.toast.message}
          </div>
        ) : null}
        {listError ? <div className="m-mt-error">{listError}</div> : null}

        {listLoading && displayRows.length === 0 ? (
          <div className="m-mt-state">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            <p>{i18n.loading}</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="m-mt-state">
            <i className="fas fa-inbox" aria-hidden="true" />
            <p>{i18n.noData}</p>
          </div>
        ) : (
          <>
            <div className="m-mt-list">
              {visible.map((row, idx) => (
                <PaymentCard
                  key={paymentRowKey(row, idx)}
                  row={row}
                  i18n={i18n}
                  selectable={canDelete(row)}
                  selected={selectedIds.has(Number(row.transaction_id))}
                  onToggle={() => toggleRow(row)}
                />
              ))}
            </div>
            {hasMore ? (
              <div ref={sentinelRef} className="m-mt-more">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                <span>
                  {shown} / {total}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {selectedCount > 0 ? (
        <div className="m-mt-actionbar">
          <span className="m-mt-actionbar-count">
            <span className="m-mt-actionbar-check" aria-hidden="true">
              <i className="fas fa-check" />
            </span>
            {getMaintenanceText(lang, "selectedCount", { n: selectedCount })}
          </span>
          <div className="m-mt-actionbar-actions">
            <button
              type="button"
              className="m-mt-clear-btn tap-scale"
              onClick={() => setSelectedIds(new Set())}
              aria-label={i18n.cancel}
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
            <button type="button" className="m-mt-delete-btn tap-scale" onClick={() => setConfirmOpen(true)}>
              <i className="fas fa-trash" aria-hidden="true" /> {i18n.delete}
            </button>
          </div>
        </div>
      ) : null}
    </MobileShell>
  );
}

function PaymentCard({ row, i18n, selectable, selected, onToggle }) {
  const deleted = Number(row.is_deleted) === 1;
  const type = String(row.transaction_type || "").toUpperCase();
  const tone = TYPE_TONE[type] || "is-slate";

  return (
    <article className={`m-mt-card m-mt-pay-card${deleted ? " is-deleted" : ""}`}>
      <button
        type="button"
        className={`m-mt-check${selected ? " is-on" : ""}${selectable ? "" : " is-disabled"}`}
        onClick={onToggle}
        disabled={!selectable}
        aria-label="select"
      >
        {selected ? <i className="fas fa-check" aria-hidden="true" /> : null}
      </button>
      <div className="m-mt-pay-body">
        <div className="m-mt-card-head">
          <div className="m-mt-card-title">
            <span className={`m-mt-type-tag ${tone}`}>{type}</span>
            {deleted ? <span className="m-mt-del-tag">{i18n.deletedTag}</span> : null}
          </div>
          <span className="m-mt-pay-amount">
            {row.currency && row.currency !== "-" ? `${row.currency} ` : ""}
            {formatMaintenanceAmount(row.amount)}
          </span>
        </div>
        <div className="m-mt-pay-accs">
          <span>
            {i18n.accountTo}: {row.account && row.account !== "-" ? row.account : "—"}
          </span>
          <span>
            {i18n.accountFrom}: {row.from_account && row.from_account !== "-" ? row.from_account : "—"}
          </span>
        </div>
        {row.description && row.description !== "-" ? (
          <p className="m-mt-desc">{stripBankProcessDescriptionPrefix(row.description)}</p>
        ) : null}
        {row.remark && row.remark !== "-" ? (
          <p className="m-mt-remark">{String(row.remark).toUpperCase()}</p>
        ) : null}
        <div className="m-mt-card-foot">
          <span>{row.dts_created}</span>
          <span>
            {i18n.submitter} {row.created_by}
          </span>
        </div>
        {deleted && row.deleted_by ? (
          <p className="m-mt-del-info">
            {i18n.deletedBy} {row.deleted_by}
            {row.dts_deleted ? ` · ${row.dts_deleted}` : ""}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function DeleteConfirm({ open, onClose, i18n, lang, items, deleting, onConfirm }) {
  return (
    <div
      className={`m-sheet-overlay m-sheet-overlay--top${
        open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="m-sheet-backdrop m-sheet-backdrop--heavy"
        onClick={deleting ? undefined : onClose}
        aria-label="Close"
      />
      <div
        className={`m-sheet-panel${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <div className="m-mt-confirm">
          <span className="m-mt-confirm-icon">
            <i className="fas fa-trash" aria-hidden="true" />
          </span>
          <h2>{getMaintenanceText(lang, "deleteConfirmTitle", { n: items.length })}</h2>
          <p className="m-mt-confirm-body">{i18n.deleteConfirmBody}</p>
          <div className="m-mt-confirm-warn">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {i18n.cannotUndo}
          </div>
          <div className="m-mt-confirm-list">
            {items.slice(0, 6).map((r) => (
              <div key={`c-${r.transaction_id}`} className="m-mt-confirm-item">
                <span className="m-mt-type-tag is-slate">
                  {String(r.transaction_type || "").toUpperCase()}
                </span>
                <span className="m-mt-confirm-amt">
                  {r.currency && r.currency !== "-" ? `${r.currency} ` : ""}
                  {formatMaintenanceAmount(r.amount)}
                </span>
                <span className="m-mt-confirm-acc">{r.account}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="m-sheet-footer">
          <button
            type="button"
            className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale"
            onClick={onClose}
            disabled={deleting}
          >
            {i18n.cancel}
          </button>
          <button
            type="button"
            className="m-sheet-footer-btn m-mt-confirm-delete tap-scale"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            ) : (
              <>
                <i className="fas fa-trash" aria-hidden="true" /> {i18n.deleteRecords}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
