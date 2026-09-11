import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { buildPaymentHistoryScope, persistPaymentHistoryScope } from "../../lib/transactionHistoryScope.js";
import { persistMobileTxListSnapshot } from "../../lib/mobileTxListSnapshot.js";
import { parseBalanceValue } from "../../lib/transactionFormat.js";
import MoneyDecimal from "../../lib/money/moneyDecimal.js";
import { resolveGridRowToAccountOption } from "../../lib/transactionPaymentLogic.js";
import { CategoryFilterChip, DateFilterChip, ScopeFilterChip } from "../dashboard/FilterChips.jsx";
import AccountBalanceTables from "./AccountBalanceTables.jsx";
import AddTransactionSheet from "./AddTransactionSheet.jsx";
import ContraInboxSheet from "./ContraInboxSheet.jsx";

function ToggleChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`m-tx-chip tap-scale${active ? " m-tx-chip--active" : ""}`}
    >
      <span className="m-tx-chip-dot" aria-hidden="true">
        <i className="fas fa-check" />
      </span>
      <span className="m-tx-chip-label">{children}</span>
    </button>
  );
}

export default function TransactionPage() {
  const { tx } = useOutletContext();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState(null);
  /** Only drive pull-to-refresh chrome for user-initiated refresh (not Back remount). */
  const [pullRefreshActive, setPullRefreshActive] = useState(false);

  useEffect(() => {
    if (pullRefreshActive && !tx.searchLoading) {
      setPullRefreshActive(false);
    }
  }, [pullRefreshActive, tx.searchLoading]);

  const onPullRefresh = useCallback(() => {
    setPullRefreshActive(true);
    tx.retry();
  }, [tx]);

  const openHistory = useCallback(
    (row) => {
      const scope = buildPaymentHistoryScope({
        row,
        dateFrom: tx.dateFrom,
        dateTo: tx.dateTo,
        scopeApi: tx.scopeApi,
        currency: tx.currency,
      });
      persistPaymentHistoryScope(scope);
      persistMobileTxListSnapshot(tx.captureListSnapshot());
      navigate("/transaction/history");
    },
    [navigate, tx],
  );

  const pickBalanceForForm = useCallback(
    (row, side) => {
      if (tx.mutationsBlocked) {
        tx.pushToast(tx.m.readOnlyModeCannotSubmit, "error");
        return;
      }
      const account = resolveGridRowToAccountOption(row, tx.accountOptions);
      if (!account) {
        tx.pushToast(tx.m.couldNotResolveAccount, "error");
        return;
      }

      const rowCurrency = String(row?.currency || "").trim().toUpperCase();
      const accountCurrency = account.currency ? String(account.currency).trim().toUpperCase() : "";
      const currency = rowCurrency || accountCurrency || "";

      // Desktop: prefer balance_full for store precision; display still half-up 2.
      const balAttr =
        row?.balance_full != null && String(row.balance_full).trim() !== ""
          ? row.balance_full
          : row?.balance;
      let amount = "";
      let amountFull = "";
      const parsed = parseBalanceValue(String(balAttr ?? "").replace(/,/g, ""));
      if (parsed !== null) {
        try {
          amountFull = MoneyDecimal.abs(String(balAttr)).toString();
          amount = MoneyDecimal.formatFixedHalfUp(amountFull, 2);
        } catch {
          amountFull = String(Math.abs(parsed));
          amount = MoneyDecimal.formatFixedHalfUp(amountFull, 2);
        }
      }

      setAddPrefill({
        id: Date.now(),
        side: side === "right" ? "right" : "left",
        account,
        amount,
        amountFull,
        currency,
      });
      setAddOpen(true);
    },
    [tx],
  );

  const openAddSheet = useCallback(() => {
    setAddPrefill(null);
    setAddOpen(true);
  }, []);

  if (tx.blocked) return null;

  const companyCode = String(tx.selectedCompany?.company_id || "").toUpperCase();
  const groupId = String(
    tx.selectedGroup || tx.selectedCompany?.group_id || tx.selectedCompany?.link_source_group || "",
  )
    .trim()
    .toUpperCase();

  const viewingCompanyCode = tx.groupsAllMode || tx.groupAllMode
    ? tx.i18n.all
    : tx.groupOnlyMode
      ? groupId
      : companyCode;
  const sidebarGroupId = tx.groupOnlyMode ? "" : groupId;
  const inboxCount = tx.contraInbox?.items?.length || 0;
  const overlayOpen = addOpen || Boolean(tx.contraInbox?.open);

  const stickyBar = (
    <div className="m-tx-sticky">
      <div className="m-fchip-row">
        <div className="m-fchip-bar">
          <DateFilterChip dash={tx} i18n={tx.i18n} />
          <ScopeFilterChip
            dash={tx}
            i18n={tx.i18n}
            groupId={groupId}
            companyCode={companyCode}
            groupOnlyMode={tx.groupOnlyMode}
          />
        </div>
      </div>

      <div className="m-tx-chips">
        <CategoryFilterChip dash={tx} i18n={tx.i18n} />
        <ToggleChip active={tx.showName} onClick={() => tx.setShowName(!tx.showName)}>
          {tx.m.showName}
        </ToggleChip>
        <ToggleChip active={tx.showCaptureOnly} onClick={() => tx.setShowCaptureOnly(!tx.showCaptureOnly)}>
          {tx.m.showCaptureOnly}
        </ToggleChip>
        <ToggleChip active={tx.showPaymentOnly} onClick={() => tx.setShowPaymentOnly(!tx.showPaymentOnly)}>
          {tx.m.showPaymentOnly}
        </ToggleChip>
        <ToggleChip active={tx.showZeroBalance} onClick={() => tx.setShowZeroBalance(!tx.showZeroBalance)}>
          {tx.m.showZeroBalance}
        </ToggleChip>
        {tx.typeSearchActive || tx.submitFocusActive ? (
          <ToggleChip active onClick={() => tx.exitTypeSearch()}>
            {tx.typeSearchFormType || tx.m.search || tx.m.exitTypeSearchAndRefresh}
          </ToggleChip>
        ) : null}
      </div>
      {tx.typeSearchActive || tx.submitFocusActive ? (
        <p className="m-tx-type-hint">{tx.m.pullToExitTypeSearch}</p>
      ) : null}
    </div>
  );

  const showLoading = tx.loading || (tx.searchLoading && !tx.displayRows.length);

  return (
    <MobileShell
      i18n={tx.i18n}
      me={tx.me}
      companyCode={viewingCompanyCode}
      groupId={sidebarGroupId}
      onLogout={tx.logout}
      onRefresh={onPullRefresh}
      refreshing={pullRefreshActive && tx.searchLoading}
      stickyBar={stickyBar}
      appBarLeftAction={
        tx.canUseContraInbox ? (
          <button
            type="button"
            onClick={() => tx.setContraInbox((s) => ({ ...s, open: true }))}
            className="m-appbar-btn m-appbar-btn--inbox tap-scale"
            aria-label={tx.m.contraInbox}
          >
            <i className="fas fa-inbox" aria-hidden="true" />
            {inboxCount > 0 ? (
              <span className="m-appbar-badge">{inboxCount > 9 ? "9+" : inboxCount}</span>
            ) : null}
          </button>
        ) : null
      }
      lang={tx.lang}
      onLangChange={tx.setLang}
      overlayOpen={overlayOpen}
      floatingAction={
        <div className="m-tx-fab-wrap">
          <button
            type="button"
            onClick={openAddSheet}
            disabled={tx.mutationsBlocked}
            className="m-tx-fab tap-scale"
            aria-label={tx.m.fabAddPayment || tx.m.addTransaction}
          >
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
        </div>
      }
      overlay={
        <>
          <AddTransactionSheet
            open={addOpen}
            onClose={() => {
              setAddOpen(false);
              setAddPrefill(null);
            }}
            m={tx.m}
            accountOptions={tx.accountOptions}
            currencyOptions={tx.formCurrencies}
            mutationsBlocked={tx.mutationsBlocked}
            onSubmit={tx.submitTx}
            pushToast={tx.pushToast}
            onTypeSearch={(t) => {
              tx.runTypeSearch(t);
              setAddOpen(false);
            }}
            typeSearchActive={tx.listFocusActive || tx.typeSearchActive}
            onExitTypeSearch={tx.exitTypeSearch}
            prefill={addPrefill}
            onPrefillConsumed={() => setAddPrefill(null)}
            entryIntent="add"
          />
          <ContraInboxSheet
            open={Boolean(tx.contraInbox?.open)}
            onClose={() => tx.setContraInbox((s) => ({ ...s, open: false }))}
            m={tx.m}
            items={tx.contraInbox?.items || []}
            loading={tx.contraInbox?.loading}
            mutationsBlocked={tx.mutationsBlocked}
            onApprove={tx.onApproveContra}
            onReject={tx.onRejectContra}
          />
        </>
      }
    >
      <div className="m-tx-page">
      {tx.toast ? (
        <div
          className={`m-tx-toast ${
            tx.toast.tone === "error"
              ? "m-tx-toast--error"
              : tx.toast.tone === "success"
                ? "m-tx-toast--success"
                : "m-tx-toast--info"
          }`}
        >
          {tx.toast.message}
        </div>
      ) : null}

      {tx.error ? <div className="m-tx-error-banner">{tx.error}</div> : null}

      {showLoading ? (
        <div className="m-tx-loading">
          <i className="fas fa-spinner fa-spin" aria-hidden="true" />
          <p>{tx.m.loadingData}</p>
        </div>
      ) : (
        <>
          {tx.searchError ? <p className="m-tx-search-error">{tx.searchError}</p> : null}

          {tx.displayRows.length === 0 ? (
            <p className="m-tx-empty">{tx.m.noAccountsFound}</p>
          ) : (
            <AccountBalanceTables
              rows={tx.displayRows}
              showName={tx.showName}
              m={tx.m}
              onOpenHistory={openHistory}
              onPickBalance={pickBalanceForForm}
            />
          )}
        </>
      )}
      </div>
    </MobileShell>
  );
}


/* cache-bust 1788512053 */
