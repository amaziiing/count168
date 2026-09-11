import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SECONDARY_VERIFY_I18N, localizeAuthApiMessage } from "../../translateFile/authTranslate.js";
import { useSyncedLoginLang, writeLoginLang } from "../../lib/loginLang.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { resolveMobileLandingPath } from "../../utils/mobilePermissions.js";
import { useAuthBackground } from "./useAuthBackground.js";
import PasswordInput from "../../components/PasswordInput.jsx";

const VARIANT_CONFIG = {
  owner: {
    expectedUserType: "owner",
    verifyApi: "api/session/verify_owner_secondary_password_api.php",
    isAlreadyVerified: (user) => !user.needs_owner_secondary,
  },
  user: {
    expectedUserType: "user",
    verifyApi: "api/session/verify_user_secondary_password_api.php",
    isAlreadyVerified: (user) => !user.needs_user_secondary,
  },
};

function loginHref() {
  return import.meta.env.PROD ? "/c168_mobile/login" : "/login";
}

export default function SecondaryPasswordPage({ variant }) {
  const config = VARIANT_CONFIG[variant];
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [lang, setLang] = useSyncedLoginLang();
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  const i18n = useMemo(() => SECONDARY_VERIFY_I18N[lang] || SECONDARY_VERIFY_I18N.en, [lang]);

  useAuthBackground();

  useEffect(() => {
    writeLoginLang(lang);
  }, [lang]);

  useEffect(() => {
    setErrorMessage("");
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json?.success || !json?.data) {
          if (!cancelled) window.location.assign(loginHref());
          return;
        }
        const user = json.data;
        if (String(user.user_type || "").toLowerCase() !== config.expectedUserType) {
          if (!cancelled) window.location.assign(loginHref());
          return;
        }
        if (config.isAlreadyVerified(user)) {
          if (!cancelled) {
            navigate(resolveMobileLandingPath(user) || "/dashboard", { replace: true });
          }
          return;
        }
      } catch {
        if (!cancelled) window.location.assign(loginHref());
        return;
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, config]);

  const onChange = (e) => {
    const numericOnly = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    setPassword(numericOnly);
    if (errorMessage) setErrorMessage("");
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const numericOnly = pasted.replace(/[^0-9]/g, "").slice(0, 6);
    setPassword(numericOnly);
    if (errorMessage) setErrorMessage("");
  };

  const onBack = async () => {
    try {
      sessionStorage.setItem("ec_skip_session_bootstrap", "1");
      await fetch(buildApiUrl("api/session/logout_api.php"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // still return to login
    }
    window.location.assign(loginHref());
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const value = password.trim();
    if (!/^\d{6}$/.test(value)) {
      setErrorMessage(i18n.digitsSix);
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("secondary_password", value);
      const res = await fetch(buildApiUrl(config.verifyApi), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        try {
          const userRes = await fetch(buildApiUrl("api/session/current_user_api.php"), {
            credentials: "include",
            cache: "no-store",
          });
          const userJson = await userRes.json();
          if (userRes.ok && userJson?.success && userJson?.data) {
            navigate(resolveMobileLandingPath(userJson.data) || "/dashboard", { replace: true });
            return;
          }
        } catch {
          /* fall through */
        }
        navigate("/dashboard", { replace: true });
        return;
      }
      setErrorMessage(localizeAuthApiMessage(json?.message, lang) || i18n.genericError);
      inputRef.current?.focus();
    } catch {
      setErrorMessage(i18n.genericError);
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="sc-login-column">
        <div className="sc-login-shell">
          <div className="sc-login-card sc-login-card--secondary">
            <div className="sc-login-card-content">
              <p className="sc-secondary-checking">{i18n.verifying}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-login-column">
      <div className="sc-login-shell">
        <div className="sc-login-card sc-login-card--secondary">
          <div className="sc-secondary-header">
            <button
              type="button"
              className="sc-secondary-back"
              onClick={onBack}
              aria-label={i18n.backToLogin}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
            </button>
            <h1 className="sc-secondary-title">{i18n.title}</h1>
          </div>

          <div className="sc-login-card-content">
            <p className="sc-secondary-lead">{i18n.lead}</p>

            <form className="sc-login-form" onSubmit={onSubmit}>
              <div className="sc-login-input-row">
                <i className="fas fa-lock sc-login-input-icon" />
                <PasswordInput
                  id="secondary_password"
                  ref={inputRef}
                  inputMode="numeric"
                  className="sc-login-input"
                  placeholder={i18n.placeholder}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  value={password}
                  onChange={onChange}
                  onPaste={onPaste}
                  showLabel={i18n.showPassword}
                  hideLabel={i18n.hidePassword}
                  onFocus={(e) => {
                    requestAnimationFrame(() => {
                      e.target.scrollIntoView({
                        block: "center",
                        inline: "nearest",
                        behavior: "smooth",
                      });
                    });
                  }}
                />
              </div>

              {errorMessage ? (
                <div className="sc-secondary-error" role="alert">
                  {errorMessage}
                </div>
              ) : null}

              <button type="submit" className="sc-login-btn sc-login-submit-btn" disabled={submitting}>
                <span>{submitting ? i18n.verifying : i18n.verify}</span>
              </button>

              <div className="sc-login-lang-ios-wrap">
                <div
                  className={`sc-login-lang-ios ${lang === "zh" ? "is-zh" : "is-en"}`}
                  role="group"
                  aria-label={i18n.switchLang}
                >
                  <span className="sc-login-lang-ios-thumb" />
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
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
