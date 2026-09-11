import { useMemo, useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { moneyToneClass } from "../../lib/money/moneyToneClass.js";
import { calculateTotals, getRoleClass } from "../../lib/transactionPaymentLogic.js";

function MoneyText({ value }) {
  return (
    <span className={moneyToneClass(value)}>
      {formatTransactionGridMoneyHalfUp(value)}
    </span>
  );
}

function DenseAccountTable({ side, rows, showName, m, totals, onOpenHistory, onPickBalance }) {
  return (
    <div className="m-tx-dense-wrap">
      <table className="m-tx-dense-table">
        <colgroup>
          <col className="m-tx-dense-col--acc" />
          <col className="m-tx-dense-col--num" span={4} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--acc">
              {m.accountTableCompact || m.accountTable || "Acc"}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.bfTable}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.winLossTableCompact}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.crDrTable}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.balanceTableCompact}
            </th>
          </tr>
          <tr className="m-tx-dense-row m-tx-dense-row--total">
            <th scope="row" className="m-tx-dense-td m-tx-dense-td--acc m-tx-dense-td--total-label">
              {m.total}
            </th>
            <td className="m-tx-dense-td m-tx-dense-td--num m-tx-dense-td--total">
              <MoneyText value={totals.bf} />
            </td>
            <td className="m-tx-dense-td m-tx-dense-td--num m-tx-dense-td--total">
              <MoneyText value={totals.win_loss} />
            </td>
            <td className="m-tx-dense-td m-tx-dense-td--num m-tx-dense-td--total">
              <MoneyText value={totals.cr_dr} />
            </td>
            <td className="m-tx-dense-td m-tx-dense-td--num m-tx-dense-td--total">
              <MoneyText value={totals.balance} />
            </td>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="m-tx-dense-row">
              <td className="m-tx-dense-td m-tx-dense-td--empty" colSpan={5}>
                {m.noAccountsFound}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const roleCls = getRoleClass(row?.role);
              const code = String(row?.account_id || "").toUpperCase();
              const name = String(row?.account_name || "").trim();
              const isAlert = row?.is_alert == 1 || row?.is_alert === true;
              const key = `${row.account_db_id || row.account_id}-${row.currency}-${row.transaction_id || ""}`;
              const balDisplay = formatTransactionGridMoneyHalfUp(row?.balance);
              return (
                <tr
                  key={key}
                  className={`m-tx-dense-row${isAlert ? " m-tx-dense-row--alert" : ""}`}
                >
                  <td
                    className={`m-tx-dense-td m-tx-dense-td--acc m-account-role${roleCls ? ` ${roleCls}` : ""}`}
                  >
                    <button
                      type="button"
                      className="m-tx-dense-acc tap-scale"
                      onClick={() => onOpenHistory?.(row)}
                      title={m.tapForHistory}
                      aria-label={`${m.tapForHistory}: ${code}`}
                    >
                      <span className="m-tx-dense-code">{code}</span>
                      {showName && name ? <span className="m-tx-dense-name">{name}</span> : null}
                    </button>
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <MoneyText value={row?.bf} />
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <MoneyText value={row?.win_loss} />
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <MoneyText value={row?.cr_dr} />
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <button
                      type="button"
                      className="m-tx-dense-bal tap-scale"
                      onClick={() => onPickBalance?.(row, side)}
                      title={m.tapBalanceToFill || m.balanceTable}
                      aria-label={
                        m.tapBalanceAria
                          ? m.tapBalanceAria
                              .replace("{account}", code)
                              .replace("{amount}", balDisplay)
                          : `${m.tapBalanceToFill || m.balanceTable}: ${code} ${balDisplay}`
                      }
                    >
                      <MoneyText value={row?.balance} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Desktop parity: left = balance ≥ 0, right = balance < 0 (sign only — not From/To role). */
export function splitAccountRowsByBalance(rows) {
  const left = [];
  const right = [];
  for (const row of rows || []) {
    const bal = parseBalanceValue(String(row?.balance ?? "").replace(/,/g, ""));
    if (bal != null && bal < 0) right.push(row);
    else left.push(row);
  }
  return { left, right };
}

export default function AccountBalanceTables({
  rows,
  showName,
  m,
  onOpenHistory,
  onPickBalance,
}) {
  const { left, right } = splitAccountRowsByBalance(rows);
  const [sideTab, setSideTab] = useState("left");
  const isLeft = sideTab === "left";
  const activeRows = isLeft ? left : right;
  /* Per-tab total — same calculateTotals as desktop left/right footers. */
  const sideTotals = useMemo(() => calculateTotals(activeRows), [activeRows]);

  return (
    <div className="m-tx-balance-root">
      <div className="m-tx-side-tabs" role="tablist" aria-label={m.accountSideTabs || "Account balance sides"}>
        <button
          type="button"
          role="tab"
          aria-selected={isLeft}
          className={`m-tx-side-tab tap-scale${isLeft ? " m-tx-side-tab--active-left" : ""}`}
          onClick={() => setSideTab("left")}
        >
          <span className="m-tx-side-tab-label">{m.leftBalanceTab || "Balance +"}</span>
          <span className={`m-tx-side-tab-count${isLeft ? " m-tx-side-tab-count--left-active" : ""}`}>
            {left.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLeft}
          className={`m-tx-side-tab tap-scale${!isLeft ? " m-tx-side-tab--active-right" : ""}`}
          onClick={() => setSideTab("right")}
        >
          <span className="m-tx-side-tab-label">{m.rightBalanceTab || "Balance -"}</span>
          <span className={`m-tx-side-tab-count${!isLeft ? " m-tx-side-tab-count--right-active" : ""}`}>
            {right.length}
          </span>
        </button>
      </div>

      <DenseAccountTable
        side={isLeft ? "left" : "right"}
        rows={activeRows}
        showName={showName}
        m={m}
        totals={sideTotals}
        onOpenHistory={onOpenHistory}
        onPickBalance={onPickBalance}
      />
    </div>
  );
}
