import { useNavigate } from "react-router-dom";
import { brandWhiteLogoUrl, onBrandLogoError } from "../../lib/brandAssets.js";
import "./mobile-app-bar.css";

/** Stroke-drawn cog — deliberately different from the solid fa-gear used by
    the Account page's currency settings button. */
function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="19"
      height="19"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function MobileAppBar({
  i18n,
  onOpenNotifications,
  onRefresh,
  refreshing = false,
  notificationCount = 0,
  leftAction = null,
  theme = "light",
  onToggleTheme,
}) {
  const navigate = useNavigate();
  const count = Number(notificationCount) || 0;
  const isDark = theme === "dark";

  const bellButton = (
    <button
      type="button"
      onClick={onOpenNotifications}
      className="m-appbar-btn m-appbar-btn--notify tap-scale"
      aria-label={i18n?.notifications || "Notifications"}
    >
      <i className="fas fa-bell text-[18px]" aria-hidden="true" />
      {count > 0 ? (
        <span className="m-appbar-badge">{count > 9 ? "9+" : count}</span>
      ) : null}
    </button>
  );

  const logo = (
    <div className="m-appbar-center">
      {typeof onRefresh === "function" ? (
        <button
          type="button"
          onClick={() => {
            if (refreshing) return;
            onRefresh();
          }}
          disabled={refreshing}
          className="m-appbar-logo-btn tap-scale"
          aria-label={i18n?.refresh || "Refresh"}
          title={i18n?.refresh || "Refresh"}
        >
          <img
            src={brandWhiteLogoUrl()}
            alt="EazyCount"
            className={`m-appbar-logo${refreshing ? " m-appbar-logo--refreshing" : ""}`}
            draggable={false}
            data-logo-idx="0"
            data-logo-kind="white"
            onError={onBrandLogoError}
          />
        </button>
      ) : (
        <img
          src={brandWhiteLogoUrl()}
          alt="EazyCount"
          className="m-appbar-logo"
          draggable={false}
          data-logo-idx="0"
          data-logo-kind="white"
          onError={onBrandLogoError}
        />
      )}
    </div>
  );

  return (
    <header className="m-appbar">
      <div className="m-appbar-grid">
        <div className="m-appbar-left-group">
          {bellButton}
          {logo}
        </div>

        <span className="m-appbar-spacer" aria-hidden="true" />

        <div className="m-appbar-right-group">
          {leftAction}
          <button
            type="button"
            onClick={onToggleTheme}
            className="m-appbar-btn m-appbar-btn--theme tap-scale"
            aria-label={i18n?.appearance || "Appearance"}
            aria-pressed={isDark}
            title={i18n?.appearance || "Appearance"}
          >
            {isDark ? (
              /* Classic sun: solid core + 8 straight rays (FA fa-sun reads as a gear) */
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <i className="fas fa-moon text-[16px]" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate("/more")}
            className="m-appbar-btn m-appbar-btn--more tap-scale"
            aria-label={i18n?.navMore || "More"}
            title={i18n?.navMore || "More"}
          >
            <GearIcon />
          </button>
        </div>
      </div>

      <div className="m-appbar-progress-track" aria-hidden={!refreshing}>
        <div
          className={`m-appbar-progress-bar ${refreshing ? "m-appbar-progress-bar--active" : "m-appbar-progress-bar--idle"}`}
        />
      </div>
    </header>
  );
}
