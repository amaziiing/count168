import { useCallback, useEffect, useMemo, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileDashboard } from "../../hooks/useMobileDashboard.js";
import CompanyAccessModal from "./CompanyAccessModal.jsx";
import CurrencyDistributionCard from "./CurrencyDistributionCard.jsx";
import CurrencyListCard from "./CurrencyListCard.jsx";
import DashboardKpiCard from "./DashboardKpiCard.jsx";
import DashboardTrendChart from "./DashboardTrendChart.jsx";
import EarningsSegmentControl from "./EarningsSegmentControl.jsx";
import { DateFilterChip, ScopeFilterChip } from "./FilterChips.jsx";
import FilterSheet from "./FilterSheet.jsx";
import HeroSummaryCard from "./HeroSummaryCard.jsx";
import ScopeBreadcrumb from "./ScopeBreadcrumb.jsx";
import "./dashboard.css";

const HERO_METRIC_SPARK_KEY = {
  profit: "profit",
  expense: "expenses",
  net: "netProfit",
  earnings: "earnings",
};

export default function DashboardPage() {
  const dash = useMobileDashboard();
  const { i18n, kpi, loading, refreshing, error, me, blocked, compareLabel } = dash;
  const [filterOpen, setFilterOpen] = useState(false);
  const [ratesHintDismissed, setRatesHintDismissed] = useState(false);
  const [heroMetric, setHeroMetric] = useState("net");
  const handleHeroSelect = useCallback((variant) => setHeroMetric(variant), []);
  const ratesHint = dash.ratesWarning && !ratesHintDismissed ? dash.ratesWarning : "";

  useEffect(() => {
    if (!dash.ratesWarning) setRatesHintDismissed(false);
  }, [dash.ratesWarning]);

  useEffect(() => {
    if (heroMetric === "earnings" && !kpi?.showEarnings) setHeroMetric("net");
  }, [heroMetric, kpi?.showEarnings]);

  const sparklineValues = useMemo(() => {
    const rows = dash.chartRows || [];
    if (rows.length < 2) return [];
    const dataKey = HERO_METRIC_SPARK_KEY[heroMetric] || "netProfit";
    const step = Math.max(1, Math.floor(rows.length / 24));
    return rows
      .filter((_, i) => i % step === 0 || i === rows.length - 1)
      .map((r) => Number(r[dataKey]) || 0);
  }, [dash.chartRows, heroMetric]);

  const earningsSegmentTabs = useMemo(() => {
    if (!dash.showSummaryPanelTabs) return [];
    const tabs = [{ id: "currency", label: i18n.earningsChartTab }];
    if (dash.showNetProfitForTab) tabs.push({ id: "netProfitFor", label: i18n.netProfitChartTab });
    if (dash.showEarningPanelTab) tabs.push({ id: "earning", label: i18n.earningChartTab });
    return tabs;
  }, [
    dash.showSummaryPanelTabs,
    dash.showNetProfitForTab,
    dash.showEarningPanelTab,
    i18n.earningsChartTab,
    i18n.netProfitChartTab,
    i18n.earningChartTab,
  ]);

  if (blocked) return null;

  const kpiCards = [
    { variant: "profit", label: i18n.profit, value: kpi?.profit, compare: kpi?.comparisons?.profit },
    { variant: "expense", label: i18n.expenses, value: kpi?.expenses, compare: kpi?.comparisons?.expenses },
    { variant: "net", label: i18n.netProfit, value: kpi?.netProfit, compare: kpi?.comparisons?.netProfit },
  ];
  if (kpi?.showEarnings) {
    kpiCards.push({
      variant: "earnings",
      label: i18n.earnings,
      value: kpi?.kpiCardEarnings,
      compare: kpi?.comparisons?.earnings,
    });
  }

  const heroCard = kpiCards.find((c) => c.variant === heroMetric) || kpiCards.find((c) => c.variant === "net");
  const heroLabel = heroCard?.label || i18n.netProfit;
  // Hero / Overview KPI stay single-currency. Multi-currency converted total lives in pie panel.
  const heroValue = heroCard?.value ?? dash.summaryValue;
  const heroCompare = heroCard?.compare ?? dash.heroCompare;

  const panelSummaryValue =
    dash.earningsPanelView === "earning"
      ? (dash.convertedEarningsTotal ?? kpi?.earnings ?? 0)
      : dash.earningsPanelView === "netProfitFor"
        ? (dash.panelCurrencyRows || []).reduce((sum, row) => sum + (parseFloat(row.netProfit) || 0), 0)
        : (dash.convertedNetProfitTotal ?? kpi?.netProfit ?? dash.summaryValue ?? 0);
  const panelConversionNote =
    dash.earningsPanelView !== "netProfitFor" && dash.useConvertedEarnings
      ? i18n.multiCurrencyNote
      : "";

  const companyCode = String(dash.selectedCompany?.company_id || "").toUpperCase();
  const groupId = String(
    dash.selectedGroup || dash.selectedCompany?.group_id || dash.selectedCompany?.link_source_group || "",
  )
    .trim()
    .toUpperCase();

  const viewingCompanyCode = dash.groupsAllMode || dash.groupAllMode
    ? i18n.all
    : dash.groupOnlyMode
      ? groupId
      : companyCode;
  const sidebarGroupId = dash.groupOnlyMode ? "" : groupId;

  const scopeTitle = [
    dash.groupsAllMode ? i18n.all : groupId,
    dash.groupOnlyMode ? i18n.groupIdShort || "Group" : dash.groupAllMode ? i18n.all : companyCode,
  ]
    .filter(Boolean)
    .join(" › ");

  const stickyBar = (
    <div className="m-fchip-bar">
      <DateFilterChip dash={dash} i18n={i18n} />
      <ScopeFilterChip
        dash={dash}
        i18n={i18n}
        groupId={groupId}
        companyCode={companyCode}
        groupOnlyMode={dash.groupOnlyMode}
      />
    </div>
  );

  return (
    <MobileShell
      i18n={i18n}
      me={me}
      companyCode={viewingCompanyCode}
      groupId={sidebarGroupId}
      onLogout={dash.logout}
      onRefresh={dash.retry}
      refreshing={Boolean(refreshing)}
      stickyBar={stickyBar}
      lang={dash.lang}
      onLangChange={dash.setLang}
    >
      <CompanyAccessModal
        open={Boolean(dash.accessModal?.open)}
        title={i18n.notice || "Notice"}
        message={dash.accessModal?.message || ""}
        confirmText={i18n.confirm || "Confirm"}
        onClose={dash.closeAccessModal}
      />
      <div className="m-dash-page">
        <div className="m-dash-glow" aria-hidden="true" />

        {error && dash.hasData ? (
          <div className="m-dash-error-banner">
            <i className="fas fa-circle-exclamation" aria-hidden="true" />
            <div className="m-dash-error-main">
              <p className="m-dash-error-title">{i18n.loadError}</p>
              <p className="m-dash-error-body">{error}</p>
            </div>
            <button type="button" onClick={dash.retry} className="m-dash-error-retry">
              {i18n.retry || "Retry"}
            </button>
          </div>
        ) : null}

        {ratesHint && (
          <div className="m-dash-rates-hint" role="status">
            <i className="fas fa-exclamation-triangle" aria-hidden="true" />
            <p>{ratesHint}</p>
            <button
              type="button"
              onClick={() => setRatesHintDismissed(true)}
              className="m-dash-rates-dismiss"
              aria-label={i18n.closeMenu || "Close"}
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="m-dash-content">
          <HeroSummaryCard
            i18n={i18n}
            label={heroLabel}
            currency={dash.currency}
            value={heroValue}
            compare={heroCompare}
            compareLabel={compareLabel}
            multiCurrency={false}
            loading={loading}
            empty={!loading && !dash.hasData}
            emptyLabel={false}
            sparklineValues={sparklineValues}
            accent={heroMetric}
          />

          {!loading && !dash.hasData && (
            <div className="m-dash-empty">
              <div className="m-dash-empty-icon">
                <i className={`fas ${error ? "fa-lock" : "fa-chart-line"}`} aria-hidden="true" />
              </div>
              <p className="m-dash-empty-title">
                {error ? i18n.emptyErrorTitle || i18n.loadError : i18n.emptyTitle || i18n.noData}
              </p>
              <p className="m-dash-empty-hint">{error ? error : i18n.emptyHint || i18n.noData}</p>
              {error ? (
                <button type="button" className="m-dash-empty-action tap-scale" onClick={dash.retry}>
                  {i18n.retry || "Retry"}
                </button>
              ) : dash.activePreset !== "thisMonth" ? (
                <button
                  type="button"
                  className="m-dash-empty-action tap-scale"
                  disabled={Boolean(refreshing)}
                  onClick={() => dash.applyPreset("thisMonth")}
                >
                  {refreshing ? i18n.loading : i18n.viewThisMonth || i18n.thisMonth}
                </button>
              ) : refreshing ? (
                <p className="m-dash-empty-loading">{i18n.loading}</p>
              ) : null}
            </div>
          )}

          {(loading || dash.hasData) && (
            <>
          <section>
            <h2 className="m-dash-section-title">{i18n.overview}</h2>
            <div className="m-dash-kpi-scroller no-scrollbar">
              {kpiCards.map((card) => (
                <DashboardKpiCard
                  key={card.variant}
                  variant={card.variant}
                  label={card.label}
                  value={card.value}
                  compare={card.compare}
                  compareLabel={compareLabel}
                  loading={loading}
                  selected={heroMetric === card.variant}
                  onSelect={handleHeroSelect}
                />
              ))}
            </div>
          </section>

          <DashboardTrendChart
            rows={dash.chartRows}
            series={dash.chartSeries}
            visible={dash.chartVisible}
            onToggleSeries={dash.toggleChartSeries}
            label={i18n.trendChart}
            dateRangeText={dash.dateRangeShort}
            xAxisLayout={dash.chartXAxisLayout}
            emptyText={loading ? i18n.loading : i18n.chartSelectSeries || i18n.noData}
            tapHint={i18n.chartTapHint}
          />

          <CurrencyDistributionCard
            i18n={i18n}
            currencyCode={dash.currency}
            rows={dash.panelCurrencyRows}
            useConverted={dash.useConvertedEarnings}
            loading={loading}
            summaryValue={panelSummaryValue}
            summaryLabel={
              dash.earningsPanelView === "earning"
                ? i18n.earnings
                : dash.earningsPanelView === "netProfitFor"
                  ? i18n.netProfitCompanyCaption || i18n.netProfit
                  : i18n.netProfit
            }
            conversionNote={panelConversionNote}
            title={
              dash.earningsPanelView === "earning"
                ? i18n.earnings
                : dash.earningsPanelView === "netProfitFor"
                  ? i18n.netProfitCompanyCaption || i18n.netProfit
                  : i18n.currencyDistribution
            }
            badgeLabel={
              dash.earningsPanelView === "netProfitFor" ? i18n.companies || i18n.company : i18n.currency
            }
            isCompanyBreakdown={dash.earningsPanelView === "netProfitFor"}
            exchangeRates={dash.exchangeRates}
            exchangeRatesLoading={dash.exchangeRatesLoading}
            tabs={
              earningsSegmentTabs.length >= 2 ? (
                <EarningsSegmentControl
                  ariaLabel={i18n.statistics}
                  tabs={earningsSegmentTabs}
                  value={dash.earningsPanelView}
                  onChange={dash.setEarningsPanelView}
                />
              ) : null
            }
            footer={
              <CurrencyListCard
                i18n={i18n}
                lang={dash.lang}
                currencyCode={dash.currency}
                rows={dash.panelCurrencyRows}
                exchangeRates={dash.exchangeRates}
                exchangeRatesLoading={dash.exchangeRatesLoading}
                useConverted={dash.useConvertedEarnings}
                loading={loading}
                embedded
                hideTitle
                isCompanyBreakdown={dash.earningsPanelView === "netProfitFor"}
              />
            }
          />
            </>
          )}
        </div>

        {loading && !dash.hasData && (
          <div className="m-dash-loading-pill" aria-live="polite">
            <span>{i18n.loading}</span>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
