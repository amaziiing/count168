import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import MobileSubpageHeader from "../../components/layout/MobileSubpageHeader.jsx";
import { fetchJson } from "../../lib/fetchJson.js";
import { useSyncedLoginLang, writeLoginLang } from "../../lib/loginLang.js";
import { MORE_I18N } from "../../translateFile/moreTranslate.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import {
  canAccessC168AutoRenew,
  canAccessC168DomainPages,
  ensureC168DomainApiSession,
  fetchOwnerCompaniesForDomain,
} from "../../lib/c168DomainAccess.js";
import { fetchAutoRenewPendingCount } from "../../lib/autoRenewApi.js";
import {
  canAccessAdmin,
  canAccessPaymentMaintenance,
  resolveMobileMoreBackPath,
} from "../../utils/mobilePermissions.js";
import { maintenanceText } from "../../translateFile/maintenanceTranslate.js";
import "./more.css";

export default function MorePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRenewPending, setAutoRenewPending] = useState(0);
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => MORE_I18N[lang] || MORE_I18N.en, [lang]);

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
        setMe(user);
        if (canAccessC168AutoRenew(user)) {
          try {
            const companies = await fetchOwnerCompaniesForDomain(ac.signal);
            if (ac.signal.aborted) return;
            await ensureC168DomainApiSession(user, companies);
            const count = await fetchAutoRenewPendingCount({ signal: ac.signal });
            if (!ac.signal.aborted) setAutoRenewPending(count);
          } catch {
            /* badge is optional */
          }
        }
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

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const groupId = String(me?.login_group_id || me?.login_identifier || "").toUpperCase();
  const backTo = resolveMobileMoreBackPath(me);
  const mt = maintenanceText(lang);
  const tools = [];
  if (canAccessAdmin(me)) {
    tools.push({
      to: "/more/users",
      icon: "fa-user-gear",
      title: i18n.userManagement,
    });
  }
  if (canAccessPaymentMaintenance(me)) {
    tools.push({
      to: "/maintenance/payment",
      icon: "fa-wallet",
      title: mt.payMaintenanceTitle,
    });
  }
  if (canAccessC168DomainPages(me)) {
    tools.push({
      to: "/more/domain",
      icon: "fa-globe",
      title: i18n.domain,
    });
    tools.push({
      to: "/more/announcement",
      icon: "fa-bullhorn",
      title: i18n.announcement,
    });
  }
  if (canAccessC168AutoRenew(me)) {
    tools.push({
      to: "/more/auto-renew",
      icon: "fa-arrows-rotate",
      title: i18n.autoRenew,
      badge: autoRenewPending > 0 ? autoRenewPending : null,
    });
  }
  tools.push({
    to: "/more/settings",
    icon: "fa-gear",
    title: i18n.settings,
  });

  return (
    <MobileShell
      i18n={i18n}
      me={me}
      companyCode={companyCode}
      groupId={groupId}
      onLogout={logout}
      onRefresh={undefined}
      lang={lang}
      onLangChange={setLang}
      stickyBar={
        <MobileSubpageHeader
          backTo={backTo}
          backAriaLabel={i18n.back}
          title={i18n.more}
          subtitle={i18n.moreSubtitle}
        />
      }
    >
      <main className="m-more-page m-more-page--settings">
        {loading ? (
          <div className="m-more-state">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="m-more-grid">
              {tools.map((tool) => (
                <Link key={tool.to} to={tool.to} className="m-more-card tap-scale">
                  <span className="m-more-icon">
                    <i className={`fas ${tool.icon}`} aria-hidden="true" />
                    {tool.badge != null ? (
                      <span className="m-more-badge" aria-label={String(tool.badge)}>
                        {tool.badge > 99 ? "99+" : tool.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="m-more-copy">
                    <strong>{tool.title}</strong>
                  </span>
                  <span className="m-more-open">
                    {i18n.open}
                    <i className="fas fa-chevron-right" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
            <button type="button" className="m-more-logout tap-scale" onClick={() => void logout()}>
              <i className="fas fa-right-from-bracket" aria-hidden="true" />
              {i18n.logout}
            </button>
          </>
        )}
      </main>
    </MobileShell>
  );
}
