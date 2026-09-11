import { useMemo } from "react";
import { parseAnnouncementCard } from "./parseAnnouncementCard.js";
import { toSafeRenderHtml } from "../../utils/content/richTextSanitizer.js";
import teamFavicon from "../../assets/favicon.ico";
import "./announcements.css";

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

function RichTextBody({ html, className = "" }) {
  if (!html) return null;
  return (
    <div
      className={`m-ann-rich-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function AnnouncementUpdateCard({
  announcement,
  labels = {},
  className = "",
  onClick,
  collapsed = false,
}) {
  const parsed = useMemo(() => {
    if (announcement?.isExpirationReminder) return null;
    return parseAnnouncementCard(announcement);
  }, [announcement]);

  if (!parsed) {
    const safeHtml = toSafeRenderHtml(announcement?.content);
    return (
      <div className={className} onClick={onClick} role={onClick ? "button" : undefined}>
        <p className="m-ann-fallback-title">{announcement?.title}</p>
        {collapsed ? (
          <p className="m-ann-fallback-preview">
            {(announcement?.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
          </p>
        ) : (
          <RichTextBody html={safeHtml} className="mt-2" />
        )}
        {announcement?.created_at ? (
          <p className="m-ann-fallback-time">{announcement.created_at}</p>
        ) : null}
      </div>
    );
  }

  const subtitle =
    parsed.subtitle ||
    (parsed.version && labels.versionUpdated
      ? String(labels.versionUpdated).replace("{version}", parsed.version)
      : "");

  if (collapsed) {
    const preview = parsed.items[0] || subtitle || parsed.title;
    return (
      <div className={className} onClick={onClick} role={onClick ? "button" : undefined}>
        <div className="m-ann-header">
          <span className="m-ann-icon">
            <BellIcon />
          </span>
          <div className="m-ann-header-main">
            <div className="m-ann-title-row">
              <p className="m-ann-title m-ann-title--truncate">{parsed.title}</p>
              {parsed.version ? <span className="m-ann-version">{parsed.version}</span> : null}
            </div>
            {announcement?.created_at ? <p className="m-ann-time">{announcement.created_at}</p> : null}
            <p className="m-ann-preview">{preview}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`m-ann-card m-ann-card--structured ${className}`.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="m-ann-header">
        <span className="m-ann-icon">
          <BellIcon />
        </span>
        <div className="m-ann-header-main">
          <div className="m-ann-title-row">
            <h3 className="m-ann-title">{parsed.title}</h3>
            {parsed.version ? <span className="m-ann-version">{parsed.version}</span> : null}
          </div>
          {subtitle ? <p className="m-ann-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <div className="m-ann-section-label">
        {parsed.sectionLabel || labels.updateIncludes || "Update includes"}
      </div>

      <ol className="m-ann-items">
        {parsed.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`} className="m-ann-item">
            <span className="m-ann-item-index">{padIndex(index)}</span>
            <span className="m-ann-item-text">{item}</span>
          </li>
        ))}
      </ol>

      {parsed.intro.length > 0
        ? parsed.intro.map((line) => (
            <p key={line} className="m-ann-intro">
              {line}
            </p>
          ))
        : null}

      {parsed.thankYou ? (
        <div className="m-ann-thanks">
          <ThumbsUpIcon />
          <p>{parsed.thankYou}</p>
        </div>
      ) : null}

      <div className="m-ann-footer">
        <div className="m-ann-team">
          <img src={teamFavicon} alt="" width={18} height={18} />
          <span>{labels.teamName || "EAZY COUNT Team"}</span>
        </div>
        {announcement?.created_at ? (
          <div className="m-ann-posted">
            <ClockIcon />
            <span>{announcement.created_at}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
