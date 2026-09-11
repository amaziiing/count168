import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LOGIN_I18N, localizeAuthApiMessage } from "../../translateFile/auth/authTranslate.js";
import { buildSpaPath } from "../../utils/core/apiUrl.js";
import { resolveDefaultLandingPath } from "../../utils/auth/sidebarPermissions.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import {
  clearDashboardFilterSession,
  seedDashboardFilterFromLogin,
} from "../../utils/company/sharedCompanyFilter.js";
import { useAuthBackground } from "./useAuthBackground.js";
import { safeLocal, safeSession } from "../../utils/storage/safeStorage.js";
import { SESSION_EXPIRED_NOTICE_KEY } from "../../utils/auth/sessionExpiryGuard.js";
import { extractPlainTextFromRichText } from "../../utils/content/richTextSanitizer.js";
import PasswordInput from "../../components/PasswordInput.jsx";

const LOGIN_ASSET_RETRY_KEY = "ec_login_asset_retry";

function tryLoginPageReloadOnce() {
  if (safeSession.getItem(LOGIN_ASSET_RETRY_KEY)) {
    safeSession.removeItem(LOGIN_ASSET_RETRY_KEY);
    return false;
  }
  safeSession.setItem(LOGIN_ASSET_RETRY_KEY, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("_", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

function AlertModal({ open, title, message, confirmText, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`sc-login-modal-overlay${open ? " is-open" : ""}`}
      aria-hidden={open ? "false" : "true"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sc-login-modal-box"
        role="dialog"
        aria-labelledby="modalTitle"
        aria-describedby="modalMessage"
      >
        <div className="sc-login-modal-icon-wrap">
          <i className="fas fa-exclamation-triangle sc-login-modal-icon" aria-hidden="true" />
        </div>
        <h3 id="modalTitle" className="sc-login-modal-title">
          {title}
        </h3>
        <p id="modalMessage" className="sc-login-modal-message">
          {message}
        </p>
        <div className="sc-login-modal-actions">
          <button type="button" className="sc-login-btn sc-login-btn-primary" onClick={onClose}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleFromUrl = searchParams.get("role") === "member" ? "member" : "admin";

  const [role, setRole] = useState(roleFromUrl);

  const setLoginRole = useCallback(
    (nextRole) => {
      setRole(nextRole);
      const next = new URLSearchParams(searchParams);
      if (nextRole === "member") {
        next.set("role", "member");
      } else {
        next.delete("role");
      }
      const qs = next.toString();
      navigate(qs ? spaPath("login", { search: `?${qs}` }) : spaPath("login"), { replace: true });
    },
    [navigate, searchParams],
  );
  const [companyId, setCompanyId] = useState("");
  const [userField, setUserField] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [maintenanceList, setMaintenanceList] = useState([]);
  const [modal, setModal] = useState({ open: false, title: "Notice", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState(() => safeLocal.getItem("login_lang") || "en");

  const verifyTimeoutRef = useRef(null);
  const langThumbRef = useRef(null);
  const prevLangRef = useRef(lang);
  const i18n = useMemo(() => LOGIN_I18N[lang] || LOGIN_I18N.en, [lang]);
  // 手机浏览器开「桌面版网站」时也会落在这个页面：UA/视口都变成桌面，但触屏能力与
  // screen.width（不随桌面模式变化）还是手机的 → 用它给这类用户一个下载 App 的提示。
  const phoneDesktopMode = useMemo(() => {
    try {
      const touch = (navigator.maxTouchPoints || 0) > 0;
      const narrowScreen = (window.screen?.width || 0) <= 900;
      return touch && narrowScreen;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  useEffect(() => {
    safeLocal.setItem("login_lang", lang);
  }, [lang]);

  useEffect(() => {
    const thumb = langThumbRef.current;
    const prevLang = prevLangRef.current;
    if (!thumb || prevLang === lang) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      prevLangRef.current = lang;
      return;
    }

    const fromX = prevLang === "zh" ? "100%" : "0%";
    const toX = lang === "zh" ? "100%" : "0%";
    const overshootX = lang === "zh" ? "112%" : "-12%";
    const reboundX1 = lang === "zh" ? "97%" : "3%";
    const reboundX2 = lang === "zh" ? "101.2%" : "-1.2%";

    thumb.animate(
      [
        { transform: `translateX(${fromX}) scaleX(1) scaleY(1)` },
        { transform: `translateX(${overshootX}) scaleX(1.1) scaleY(0.9)`, offset: 0.46 },
        { transform: `translateX(${reboundX1}) scaleX(0.95) scaleY(1.05)`, offset: 0.68 },
        { transform: `translateX(${reboundX2}) scaleX(1.03) scaleY(0.97)`, offset: 0.86 },
        { transform: `translateX(${toX}) scaleX(0.99) scaleY(1.01)`, offset: 0.94 },
        { transform: `translateX(${toX}) scaleX(1) scaleY(1)` },
      ],
      {
        duration: 980,
        easing: "cubic-bezier(0.34, 1.72, 0.64, 1)",
        fill: "none",
      }
    );

    prevLangRef.current = lang;
  }, [lang]);

  useEffect(() => {
    safeSession.removeItem(LOGIN_ASSET_RETRY_KEY);
  }, []);

  useEffect(() => {
    if (safeSession.getItem("ec_skip_session_bootstrap") === "1") {
      safeSession.removeItem("ec_skip_session_bootstrap");
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/session/current_user_api.php", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (cancelled || !res.ok || !json?.success || !json?.data) return;

        const user = json.data;
        const userType = String(user.user_type || "").toLowerCase();
        if (userType === "member") {
          navigate(spaPath("member"), { replace: true });
          return;
        }
        if (user.needs_owner_secondary) {
          navigate(spaPath("owner-secondary-password"), { replace: true });
          return;
        }
        if (user.needs_user_secondary) {
          navigate(spaPath("user-secondary-password"), { replace: true });
          return;
        }
        const landing = resolveDefaultLandingPath(user);
        navigate(landing || spaPath("login"), { replace: true });
      } catch (err) {
        if (err?.name === "AbortError") return;
        // stay on login page when not authenticated
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [navigate]);

  const showNotice = useCallback(
    (message, title) => {
      setModal({
        open: true,
        title: title || i18n.notice,
        message: message || i18n.unknownError,
      });
    },
    [i18n.notice]
  );

  useEffect(() => {
    const msg = safeSession.getItem("ec_maintenance_notice");
    if (!msg) return;
    safeSession.removeItem("ec_maintenance_notice");
    showNotice(msg, i18n.notice);
  }, [showNotice, i18n.notice]);

  // Redirected here by the session expiry guard (idle timeout / kicked session).
  useEffect(() => {
    if (safeSession.getItem(SESSION_EXPIRED_NOTICE_KEY) !== "1") return;
    safeSession.removeItem(SESSION_EXPIRED_NOTICE_KEY);
    showNotice(i18n.sessionExpired, i18n.notice);
  }, [showNotice, i18n.notice, i18n.sessionExpired]);

  useEffect(() => {
    document.body.classList.remove(
      "transaction-page",
      "member-winloss-page",
      "dashboard-page",
      "dashboard-home-page",
      "account-page",
      "account-page--show-all",
      "announcement-page",
      "announcement-modal-open",
      "datacapture-page",
      "datacapture-summary-page",
      "datacapture-table-expanded",
      "report-page",
      "process-page",
      "process-page--bank",
      "process-page--show-all",
      "process-page--bank-show-all",
      "user-page",
      "user-page--show-all",
      "auto-renew-page-body",
      "maintenance-page",
      "ownership-page",
      "domain-page",
      "deleted-log-page",
      "transaction-payment-history-page",
      "transaction-payment-history-page--popup",
      "transaction-payment-history-page--popup-compact",
      "ec-auth-shell",
      "ec-payment-history-chromeless",
      "ec-login-scope-group",
      "ec-login-scope-company",
      "sidebar-collapsed",
      "sidebar-tablet-expanded",
      "page-ready",
    );
  }, []);

  useAuthBackground();

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/maintenance/get_public_api.php", {
          signal: ac.signal,
          credentials: "include",
        });
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setMaintenanceList(result.data);
        } else {
          setMaintenanceList([]);
        }
      } catch (e) {
        if (e.name !== "AbortError") setMaintenanceList([]);
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const v = companyId.trim();
    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
    if (!v) return undefined;

    verifyTimeoutRef.current = setTimeout(async () => {
      try {
        const fd = new FormData();
        fd.append("company_id", v);
        await fetch("/api/company/verify_api.php", { method: "POST", body: fd });
      } catch {
        /* silent; login validates */
      }
    }, 500);

    return () => {
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
    };
  }, [companyId]);

  const userPlaceholder = useMemo(
    () => (role === "member" ? i18n.accountPlaceholder : i18n.usernamePlaceholder),
    [role, i18n.accountPlaceholder, i18n.usernamePlaceholder]
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("action", "login");
      fd.append("company_id", companyId.toUpperCase().trim());
      fd.append("password", password);
      fd.append("login_role", role);
      if (role === "member") {
        fd.append("account_id", userField.toUpperCase().trim());
      } else {
        fd.append("login_id", userField.toUpperCase().trim());
        if (rememberMe) fd.append("remember_me", "1");
      }

      const res = await fetch("/api/session/login_api.php", {
        method: "POST",
        body: fd,
        credentials: "include",
        cache: "no-store",
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        const msg = res.ok
          ? i18n.loginInvalidResponse
          : i18n.loginServerError.replace("{status}", String(res.status));
        if (tryLoginPageReloadOnce()) return;
        showNotice(msg);
        return;
      }
      if (data.status === "success" && data.redirect) {
        safeSession.removeItem(LOGIN_ASSET_RETRY_KEY);
        clearDashboardFilterSession();
        const loginScope = String(data.login_scope || "").trim().toLowerCase();
        const loginIdentifier = String(data.login_identifier || companyId).trim().toUpperCase();
        if (loginScope === "group" || loginScope === "company") {
          seedDashboardFilterFromLogin({
            loginScope,
            loginIdentifier,
            sessionCompanyId: data.company_id != null ? Number(data.company_id) : null,
            sessionCompanyCode: loginScope === "company" ? loginIdentifier : null,
          });
        }

        const userType = String(data.user_type || "").toLowerCase();
        const redirect = String(data.redirect || "");
        const loginRole = role;

        // Smooth routing: do not follow legacy "dashboard.php -> member" chain.
        if (loginRole === "member" || userType === "member") {
          navigate(spaPath("member"), { replace: true });
          return;
        }

        const internalPath = (() => {
          const r = redirect.trim();
          if (/owner[-_]secondary[-_]password/i.test(r) || r === "/owner-secondary-password") {
            return "/owner-secondary-password";
          }
          if (/user[-_]secondary[-_]password/i.test(r) || r === "/user-secondary-password") {
            return "/user-secondary-password";
          }
          if (r.startsWith("/") && !r.startsWith("//")) return r;
          return null;
        })();

        if (internalPath) {
          if (internalPath === "/dashboard" || /dashboard/i.test(internalPath)) {
            try {
              const userRes = await fetch("/api/session/current_user_api.php", {
                credentials: "include",
                cache: "no-store",
              });
              const userJson = await userRes.json();
              if (userRes.ok && userJson?.success && userJson?.data) {
                const landing = resolveDefaultLandingPath(userJson.data);
                navigate(landing || spaPath("login"), { replace: true });
                return;
              }
            } catch {
              /* fall through to dashboard redirect; layout guard will correct */
            }
          }
          navigate(buildSpaPath(internalPath), { replace: true });
          return;
        }

        if (redirect.startsWith("http://") || redirect.startsWith("https://")) {
          window.location.href = redirect;
        } else {
          window.location.assign(new URL(redirect, `${window.location.origin}/`).toString());
        }
        return;
      }
      showNotice(localizeAuthApiMessage(data.message, lang) || i18n.loginFailed);
    } catch {
      if (tryLoginPageReloadOnce()) return;
      showNotice(i18n.loginError);
    } finally {
      setSubmitting(false);
    }
  };

  const maintenanceVisible = maintenanceList.length > 0;

  return (
    <>
      {/* Inner column: width locked here so zh/en cannot change intrinsic size after Tailwind/layout CSS */}
      <div className="sc-login-column">
        <div className="sc-login-shell">
        {maintenanceVisible && (
          <div className="sc-login-maintenance-wrapper">
            <div className="sc-login-maintenance-track">
              {[...maintenanceList, ...maintenanceList].filter(Boolean).map((item, index) => (
                <div className="sc-login-maintenance-item" key={`${item.id}-${index}`}>
                  <span className="sc-login-maintenance-dot" />
                  <span className="sc-login-maintenance-label">{item.prefix || i18n.maintenanceLabel}</span>
                  <span>{extractPlainTextFromRichText(item.content)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {phoneDesktopMode && (
          <div className="sc-login-touch-hint">
            <span>{i18n.desktopModeHint}</span>
            <a href="/app/">{i18n.mobileAppDownload}</a>
            <a href="/c168_mobile/login">{i18n.mobileSite}</a>
          </div>
        )}

        <div className="sc-login-card">
          <div className="sc-login-role-tabs">
            <button
              id="admin-tab"
              type="button"
              className={`sc-login-role-tab${role === "admin" ? " active" : ""}`}
              onClick={() => setLoginRole("admin")}
            >
              {i18n.admin}
            </button>
            <button
              id="member-tab"
              type="button"
              className={`sc-login-role-tab${role === "member" ? " active" : ""}`}
              onClick={() => setLoginRole("member")}
            >
              {i18n.member}
            </button>
          </div>

          <div className="sc-login-card-content">
            <form className="sc-login-form" onSubmit={onSubmit}>
              <div className="sc-login-input-row">
                <i className="fas fa-building sc-login-input-icon" />
                <input
                  id="company-id"
                  type="text"
                  className="sc-login-input"
                  placeholder={i18n.companyPlaceholder}
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div className="sc-login-input-row">
                <i className="fas fa-user sc-login-input-icon" />
                <input
                  id="user-id"
                  type="text"
                  className="sc-login-input"
                  placeholder={userPlaceholder}
                  required
                  value={userField}
                  onChange={(e) => setUserField(e.target.value)}
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div className="sc-login-input-row">
                <i className="fas fa-lock sc-login-input-icon" />
                <PasswordInput
                  id="password"
                  className="sc-login-input"
                  placeholder={i18n.passwordPlaceholder}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  showLabel={i18n.showPassword}
                  hideLabel={i18n.hidePassword}
                  autoComplete="current-password"
                />
              </div>

              <div className="sc-login-options">
                <label className="sc-login-remember">
                  <input
                    type="checkbox"
                    className="sc-login-remember-check"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="sc-login-remember-slider" aria-hidden="true" />
                  <span className="sc-login-remember-text">{i18n.rememberMe}</span>
                </label>
                {role === "admin" && (
                  <a href="/reset-password" className="sc-login-forgot-link">
                    {i18n.forgotPassword}
                  </a>
                )}
              </div>

              <button type="submit" className="sc-login-btn sc-login-submit-btn" disabled={submitting}>
                <span>{submitting ? i18n.loggingIn : i18n.login}</span>
              </button>

              <div className="sc-login-lang-ios-wrap">
                <div
                  className={`sc-login-lang-ios ${lang === "zh" ? "is-zh" : "is-en"}`}
                  role="group"
                  aria-label="Switch language"
                >
                  <span ref={langThumbRef} className="sc-login-lang-ios-thumb" />
                  <button
                    type="button"
                    className={`sc-login-lang-seg${lang === "en" ? " active" : ""}`}
                    onClick={() => setLang("en")}
                    aria-pressed={lang === "en"}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={`sc-login-lang-seg${lang === "zh" ? " active" : ""}`}
                    onClick={() => setLang("zh")}
                    aria-pressed={lang === "zh"}
                  >
                    中
                  </button>
                </div>
              </div>

              <div className="sc-login-app-row">
                <a className="sc-login-app-link" href="/app/">
                  {i18n.mobileApp} · <em>{i18n.mobileAppDownload}</em>
                </a>
              </div>
            </form>
          </div>
        </div>
        </div>
      </div>

      <AlertModal
        open={modal.open}
        title={modal.title}
        message={modal.message}
        confirmText={i18n.confirm}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </>
  );
}
