import { useMemo } from "react";
import { parseAnnouncementCard } from "./parseAnnouncementCard.js";
import { toSafeRenderHtml } from "../../utils/content/richTextSanitizer.js";

function faviconUrl() {
  try {
    return new URL("/favicon.ico", window.location.origin).href;
  } catch {
    return "/favicon.ico";
  }
}

function padIndex(index) {
  return String(index + 1).padStart(2, "0");
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a5 5 0 0 0-5 5v2.2c0 .7-.2 1.4-.6 2L5.2 14a1.2 1.2 0 0 0 1 1.9h11.6a1.2 1.2 0 0 0 1-1.9l-1.2-1.8c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ThumbsUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4.5 15.5 9H20a1.5 1.5 0 0 1 1.45 1.89l-1.6 7A1.5 1.5 0 0 1 18.4 19H10V9.7L12.2 4.9A1.4 1.4 0 0 1 14 4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 9H7.5A1.5 1.5 0 0 0 6 10.5v7A1.5 1.5 0 0 0 7.5 19H10" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4.5l3 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Structured announcement card. Falls back to classic title/html/time when parse fails.
 */
export default function AnnouncementUpdateCard({
  announcement,
  labels = {},
  className = "",
  onClick,
}) {
  const parsed = useMemo(() => {
    if (announcement?.isExpirationReminder) return null;
    return parseAnnouncementCard(announcement);
  }, [announcement]);

  if (!parsed) {
    return (
      <div className={className} onClick={onClick}>
        <div className="notification-title">{announcement?.title}</div>
        <div
          className="notification-message rich-text-renderer"
          dangerouslySetInnerHTML={{ __html: toSafeRenderHtml(announcement?.content) }}
        />
        <div className="notification-time">{announcement?.created_at}</div>
      </div>
    );
  }

  const subtitle =
    parsed.subtitle ||
    (parsed.version && labels.versionUpdated
      ? String(labels.versionUpdated).replace("{version}", parsed.version)
      : "");

  return (
    <div className={`${className} announcement-update-card`.trim()} onClick={onClick}>
      <div className="auc-header">
        <div className="auc-bell" aria-hidden="true">
          <BellIcon />
        </div>
        <div className="auc-heading">
          <div className="auc-title-row">
            <h3 className="auc-title">{parsed.title}</h3>
            {parsed.version ? <span className="auc-version">{parsed.version}</span> : null}
          </div>
          {subtitle ? <p className="auc-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <div className="auc-section-label">
        <span>{parsed.sectionLabel || labels.updateIncludes || "Update includes"}</span>
      </div>

      <ol className="auc-list">
        {parsed.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`} className="auc-item">
            <span className="auc-index">{padIndex(index)}</span>
            <span className="auc-item-text" dangerouslySetInnerHTML={{ __html: item }} />
          </li>
        ))}
      </ol>

      {parsed.intro.length > 0
        ? parsed.intro.map((line) => (
            <p key={line} className="auc-extra">
              {line}
            </p>
          ))
        : null}

      {parsed.thankYou ? (
        <div className="auc-thanks">
          <span className="auc-thanks-icon" aria-hidden="true">
            <ThumbsUpIcon />
          </span>
          <p>{parsed.thankYou}</p>
        </div>
      ) : null}

      <div className="auc-footer">
        <div className="auc-brand">
          <img className="auc-brand-mark" src={faviconUrl()} alt="" width={22} height={22} />
          <span>{labels.teamName || "EAZY COUNT Team"}</span>
        </div>
        {announcement?.created_at ? (
          <div className="auc-time">
            <ClockIcon />
            <span>{announcement.created_at}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
