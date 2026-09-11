import { toSafeRenderHtml } from "../../utils/content/richTextSanitizer.js";

const VERSION_RE = /Version\s*(\d+(?:\.\d+)*)/i;
const NUMBERED_PREFIX_RE = /^\s*(?:\d{1,2}[\.、\)]\s+|[-•*]\s+)/;
const THANK_RE = /感谢|thank\s+you/i;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVersion(...sources) {
  for (const source of sources) {
    const match = String(source ?? "").match(VERSION_RE);
    if (match) return `Version ${match[1]}`;
  }
  return "";
}

function stripNumberedPrefix(text) {
  return decodeText(text).replace(NUMBERED_PREFIX_RE, "");
}

function stripNumberedPrefixHtml(html) {
  return String(html ?? "").replace(NUMBERED_PREFIX_RE, "");
}

/**
 * Returns both the plain text (for de-dup/matching) and the sanitized inner HTML
 * (so links inside a list item keep working) for each <li>.
 */
function collectListItems(root) {
  const items = [];
  root.querySelectorAll("li").forEach((li) => {
    const text = decodeText(li.textContent);
    if (!text) return;
    items.push({
      text: stripNumberedPrefix(text),
      html: stripNumberedPrefixHtml((li.innerHTML || "").trim()),
    });
  });
  return items;
}

function collectParagraphs(root) {
  const blocks = [];

  function pushBlock(text) {
    const cleaned = decodeText(text);
    if (!cleaned) return;
    cleaned
      .split(/\n+/)
      .map((line) => decodeText(line))
      .filter(Boolean)
      .forEach((line) => blocks.push(line));
  }

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushBlock(node.textContent);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") return;
    if (tag === "br") {
      blocks.push("");
      return;
    }
    if (tag === "p" || /^h[1-4]$/.test(tag) || tag === "blockquote" || tag === "div" || tag === "pre") {
      // Prefer line breaks inside the block (common paste from Word/notes).
      const html = node.innerHTML || "";
      if (/<br\s*\/?>/i.test(html)) {
        const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
        pushBlock(withBreaks);
      } else {
        pushBlock(node.textContent);
      }
      return;
    }
    pushBlock(node.textContent);
  });

  return blocks.filter(Boolean);
}

function collectNumberedFromPlain(blocks) {
  const items = [];
  const rest = [];
  blocks.forEach((line) => {
    if (NUMBERED_PREFIX_RE.test(line)) {
      const text = stripNumberedPrefix(line);
      if (text) items.push({ text, html: escapeHtml(text) });
      return;
    }
    rest.push(line);
  });
  return { items, rest };
}

/**
 * Parse announcement title/content into a structured update-card model.
 * Returns null when there is nothing list-like to render (caller should fall back).
 */
export function parseAnnouncementCard({ title = "", content = "" } = {}) {
  const safeTitle = decodeText(title);
  const html = toSafeRenderHtml(content);
  if (!html && !safeTitle) return null;

  let items = [];
  let blocks = [];

  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, "text/html");
    const root = doc.getElementById("root") || doc.body;
    items = collectListItems(root);
    blocks = collectParagraphs(root);
  } else {
    blocks = decodeText(content)
      .split(/\n+/)
      .map((line) => decodeText(line))
      .filter(Boolean);
  }

  if (items.length === 0) {
    const numbered = collectNumberedFromPlain(blocks);
    items = numbered.items;
    blocks = numbered.rest;
  }

  if (items.length === 0) return null;

  let sectionLabel = "";
  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, "text/html");
    const root = doc.getElementById("root") || doc.body;
    const firstHeading = Array.from(root.children).find((el) => {
      const tag = el.tagName.toLowerCase();
      return /^h[2-4]$/.test(tag) && decodeText(el.textContent);
    });
    if (firstHeading) {
      sectionLabel = decodeText(firstHeading.textContent).slice(0, 80);
    }
  }

  const thankYouBlocks = [];
  const introBlocks = [];
  blocks.forEach((line) => {
    if (sectionLabel && line === sectionLabel) return;
    if (/本次更新|this update includes/i.test(line)) {
      if (!sectionLabel) sectionLabel = line.slice(0, 80);
      return;
    }
    if (items.some((item) => item.text === stripNumberedPrefix(line))) return;
    if (THANK_RE.test(line)) thankYouBlocks.push(line);
    else introBlocks.push(line);
  });

  const plainBlob = [safeTitle, ...blocks, ...items.map((item) => item.text)].join("\n");
  const version = extractVersion(safeTitle, plainBlob, html);

  return {
    title: safeTitle || "Announcement",
    version,
    sectionLabel,
    /** First non-thanks prose block; UI may fall back to versionUpdated label. */
    subtitle: introBlocks[0] || "",
    intro: introBlocks.slice(1),
    items: items.map((item) => item.html),
    thankYou: thankYouBlocks.join(" "),
  };
}
