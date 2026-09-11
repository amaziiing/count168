import { useEffect, useState } from "react";

/** Same-tab language bus — mirrors desktop `eazycount:language-updated`. */
export const LANGUAGE_UPDATED_EVENT = "eazycount:language-updated";

export function readLoginLang() {
  try {
    return localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

/** React binding for site-wide language: every consumer re-renders when any
    writer calls writeLoginLang (app-bar toggle, settings page, login page) —
    no remount needed. */
export function useSyncedLoginLang() {
  const [lang, setLangState] = useState(() => readLoginLang());
  useEffect(() => {
    const sync = (e) => setLangState(e?.detail?.lang === "zh" ? "zh" : "en");
    window.addEventListener(LANGUAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(LANGUAGE_UPDATED_EVENT, sync);
  }, []);
  return [lang, setLangState];
}

/** Persist `login_lang` and notify same-tab listeners (e.g. bottom nav). */
export function writeLoginLang(lang) {
  const normalized = lang === "zh" ? "zh" : "en";
  try {
    localStorage.setItem("login_lang", normalized);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(LANGUAGE_UPDATED_EVENT, { detail: { lang: normalized } }),
    );
  } catch {
    /* ignore */
  }
  return normalized;
}
