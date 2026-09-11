import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import MobileSubpageHeader from "../../components/layout/MobileSubpageHeader.jsx";
import { fetchJson } from "../../lib/fetchJson.js";
import { useSyncedLoginLang, writeLoginLang } from "../../lib/loginLang.js";
import { reportText } from "../../translateFile/reportTranslate.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { canShowReportEntry, resolveMobileLandingPath } from "../../utils/mobilePermissions.js";
import "./report.css";

export default function ReportHubPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => reportText(lang), [lang]);

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { res, json } = await fetchJson(buildApiUrl("api/session/current_user_api.php"), {
          signal: ac.signal,
        });
        if (!res.ok || !json?.success || !json?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = json.data;
        if (!canShowReportEntry(user)) {
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);
      } catch (error) {
        if (error?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const reports = [
    {
      to: "/report/domain",
      icon: "fa-chart-column",
      title: i18n.domainTitle,
      desc: i18n.domainDesc,
      features: i18n.domainFeatures,
    },
    {
      to: "/report/customer",
      icon: "fa-chart-column",
      title: i18n.customerTitle,
      desc: i18n.customerDesc,
      features: i18n.customerFeatures,
    },
  ];

  const stickyBar = (
    <MobileSubpageHeader
      backTo="/more"
      backAriaLabel={i18n.backToMore}
      title={i18n.hubTitle}
      subtitle={i18n.hubSubtitle}
    />
  );

  return (
    <MobileShell
      i18n={i18n}
      me={me}
      onLogout={logout}
      lang={lang}
      onLangChange={setLang}
      stickyBar={stickyBar}
    >
      <main className="m-rpt-page">
        {loading ? (
          <div className="m-rpt-state">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <p className="m-rpt-section-label">{i18n.sectionReports}</p>
            <div className="m-rpt-record-list">
              {reports.map((r) => (
                <Link key={r.to} to={r.to} className="m-rpt-record-card tap-scale">
                  <span className="m-rpt-record-icon">
                    <i className={`fas ${r.icon}`} aria-hidden="true" />
                  </span>
                  <span className="m-rpt-record-copy">
                    <strong>{r.title}</strong>
                    <small>{r.desc}</small>
                    <em className="m-rpt-record-features">{r.features}</em>
                  </span>
                  <i className="fas fa-chevron-right m-rpt-record-chevron" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </MobileShell>
  );
}
