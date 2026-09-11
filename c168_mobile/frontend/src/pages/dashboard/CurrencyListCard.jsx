import { memo } from "react";
import {
  formatFrankfurterUnitRate,
  getCurrencyColor,
  resolveEarningsRowDisplayAmounts,
} from "../../lib/dashboardEarnings.js";
import { formatCurrency } from "../../lib/dashboardFormat.js";
import { getCurrencyMeta } from "../../lib/currencyMeta.js";

const CurrencyListCard = memo(function CurrencyListCard({
  i18n,
  lang,
  currencyCode,
  rows,
  exchangeRates,
  exchangeRatesLoading,
  useConverted,
  loading,
  title,
  isCompanyBreakdown = false,
  embedded = false,
  hideTitle = false,
}) {
  const sorted = [...rows].sort((a, b) => {
    const av = Math.abs(Number(a.earningsConverted ?? a.earnings) || 0);
    const bv = Math.abs(Number(b.earningsConverted ?? b.earnings) || 0);
    return bv - av;
  });
  const displayRows = sorted.length ? sorted : [];
  const headTitle = title || (isCompanyBreakdown ? i18n.companies : i18n.currencies);
  const showRate = !isCompanyBreakdown && useConverted;
  const Root = embedded ? "div" : "section";
  const rootClass = embedded
    ? "m-dash-currency-list m-dash-currency-list--embedded"
    : "m-dash-card m-dash-currency-list";

  if (!rows?.length && !loading) {
    return (
      <Root className={embedded ? "m-dash-currency-list m-dash-currency-list--embedded" : "m-dash-card m-dash-card--padded"}>
        {!hideTitle ? <h2 className="m-dash-card-title">{headTitle}</h2> : null}
        <p className="m-dash-card-empty" style={{ marginTop: embedded ? "0.75rem" : "1.5rem", marginBottom: "0.5rem" }}>
          {i18n.noData}
        </p>
      </Root>
    );
  }

  return (
    <Root className={rootClass}>
      {!hideTitle ? (
        <div className="m-dash-currency-list-head">
          <h2 className="m-dash-card-title">{headTitle}</h2>
          {!loading && displayRows.length > 0 ? (
            <span className="m-dash-currency-list-count">{displayRows.length}</span>
          ) : null}
        </div>
      ) : null}

      <ul className="m-dash-currency-rows">
        {displayRows.map((row, index) => {
          const code = String(row.code).toUpperCase();
          const meta = isCompanyBreakdown ? null : getCurrencyMeta(code, lang);
          const color = getCurrencyColor(code, index);
          const { primary, native } = resolveEarningsRowDisplayAmounts(
            row,
            currencyCode,
            exchangeRates.rates,
            !isCompanyBreakdown && useConverted,
          );
          const rateLabel = showRate
            ? formatFrankfurterUnitRate(code, currencyCode, exchangeRates.rates)
            : "";
          const amount = loading ? "…" : primary != null ? formatCurrency(primary) : formatCurrency(0);
          const negative = Number(primary) < 0;
          const subtitle = isCompanyBreakdown
            ? row.group
              ? `${i18n.groupIdShort || "Group"} ${row.group}`
              : i18n.company
            : meta?.name;

          return (
            <li key={`${code}-${row.group || ""}`}>
              <div className="m-dash-currency-row">
                {isCompanyBreakdown ? (
                  <span
                    className="m-dash-currency-flag m-dash-currency-flag--company"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  >
                    {code.slice(0, 2)}
                  </span>
                ) : (
                  <span className="m-dash-currency-flag" aria-hidden="true">
                    {meta?.flag}
                  </span>
                )}

                <div className="m-dash-currency-main">
                  <p className="m-dash-currency-code">
                    <span className="m-dash-currency-dot" style={{ backgroundColor: color }} aria-hidden="true" />
                    {code}
                  </p>
                  <p className="m-dash-currency-name">{subtitle}</p>
                </div>

                <div className="m-dash-currency-amounts">
                  <p className={`m-dash-currency-amount${negative ? " m-dash-currency-amount--neg" : ""}`}>
                    {amount}
                  </p>
                  {showRate && native != null && Number(native) !== Number(primary) ? (
                    <p className="m-dash-currency-native">
                      ≈ {formatCurrency(native)} {code}
                    </p>
                  ) : null}
                  {showRate ? (
                    <p className="m-dash-currency-rate">
                      {i18n.rate} {exchangeRatesLoading ? "…" : rateLabel}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Root>
  );
});

export default CurrencyListCard;
