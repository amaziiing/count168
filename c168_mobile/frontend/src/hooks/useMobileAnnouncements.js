import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  canAccessC168DomainPages,
  ensureC168DomainApiSession,
  fetchOwnerCompaniesForDomain,
} from "../lib/c168DomainAccess.js";
import { fetchJson } from "../lib/fetchJson.js";
import { isSystemMaintenanceItUser } from "../lib/loginScope.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { announcementText, getAnnouncementText } from "../translateFile/announcementTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import {
  composeAnnouncementSection,
  splitAnnouncementSection,
} from "../components/announcements/announcementSectionLabel.js";
import {
  isRichTextEffectivelyEmpty,
  normalizeRichTextInput,
  sanitizeRichTextHtml,
} from "../utils/content/richTextSanitizer.js";

async function postForm(url, fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value != null) fd.append(key, String(value));
  });
  const { res, json } = await fetchJson(buildApiUrl(url), {
    method: "POST",
    body: fd,
  });
  return { res, json };
}

const EMPTY_MODE = {
  enabled: false,
  maintenance_message_id: null,
  message_preview: "",
  updated_by: "",
  updated_at: "",
};

export function useMobileAnnouncements() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => announcementText(lang), [lang]);
  const t = useCallback((key, params) => getAnnouncementText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [maintenanceList, setMaintenanceList] = useState([]);
  const [maintenanceMode, setMaintenanceMode] = useState(EMPTY_MODE);
  const [canManageMaintenanceMode, setCanManageMaintenanceMode] = useState(false);
  const [modeSubmitting, setModeSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const meRef = useRef(null);
  const companiesRef = useRef([]);
  meRef.current = me;
  companiesRef.current = companies;

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const loadAnnouncements = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const synced = await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        if (!synced) {
          if (!silent) setError(t("accessDenied"));
          return false;
        }
        const { res, json } = await fetchJson(buildApiUrl("api/announcements/announcement_list_api.php"));
        if (!res.ok || !json?.success) {
          if (!silent) {
            setError(json?.message || t("loadAnnouncementsFailed", { message: "Unknown error" }));
            setAnnouncements([]);
          }
          return false;
        }
        if (!silent) setError("");
        setAnnouncements(Array.isArray(json.data) ? json.data : []);
        return true;
      } catch (err) {
        if (!silent) {
          setError(t("loadAnnouncementsFailed", { message: err?.message || "Unknown error" }));
          setAnnouncements([]);
        }
        return false;
      }
    },
    [t],
  );

  const loadMaintenance = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const synced = await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        if (!synced) return false;
        const { res, json } = await fetchJson(buildApiUrl("api/maintenance/list_api.php"));
        if (!res.ok || !json?.success) {
          if (!silent) {
            notify(t("loadMaintenanceFailed", { message: json?.message || "Unknown error" }), "error");
            setMaintenanceList([]);
          }
          return false;
        }
        setMaintenanceList(Array.isArray(json.data) ? json.data : []);
        return true;
      } catch (err) {
        if (!silent) {
          notify(t("loadMaintenanceFailed", { message: err?.message || "Unknown error" }), "error");
          setMaintenanceList([]);
        }
        return false;
      }
    },
    [notify, t],
  );

  const loadMaintenanceMode = useCallback(async () => {
    if (!isSystemMaintenanceItUser(meRef.current)) {
      setCanManageMaintenanceMode(false);
      return;
    }
    try {
      const { res, json } = await fetchJson(buildApiUrl("api/maintenance/mode_api.php"));
      if (res.status === 403) {
        setCanManageMaintenanceMode(false);
        return;
      }
      if (json?.success && json.data) {
        setCanManageMaintenanceMode(true);
        setMaintenanceMode({
          enabled: Boolean(json.data.enabled),
          maintenance_message_id: json.data.maintenance_message_id ?? null,
          message_preview: json.data.message_preview || "",
          updated_by: json.data.updated_by || "",
          updated_at: json.data.updated_at || "",
        });
      } else {
        setCanManageMaintenanceMode(false);
      }
    } catch {
      setCanManageMaintenanceMode(false);
    }
  }, []);

  const loadAll = useCallback(
    async ({ silent = false } = {}) => {
      await Promise.all([
        loadAnnouncements({ silent }),
        loadMaintenance({ silent }),
        loadMaintenanceMode(),
      ]);
    },
    [loadAnnouncements, loadMaintenance, loadMaintenanceMode],
  );

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
        const ownerCompanies = await fetchOwnerCompaniesForDomain(ac.signal);
        if (ac.signal.aborted) return;
        setCompanies(ownerCompanies);

        if (!canAccessC168DomainPages(user)) {
          setBlocked(true);
          navigate("/more", { replace: true });
          return;
        }
        const synced = await ensureC168DomainApiSession(user, ownerCompanies);
        if (!synced) {
          setError(t("accessDenied"));
          setLoading(false);
          return;
        }
        await loadAll();
      } catch (e) {
        if (e?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      ac.abort();
      clearTimeout(toastTimer.current);
    };
  }, [navigate, loadAll, t]);

  useRealtimeDomain(
    [REALTIME_DOMAINS.ANNOUNCEMENTS, REALTIME_DOMAINS.MAINTENANCE],
    () => {
      void loadAll({ silent: true });
    },
    { enabled: Boolean(me) && !blocked },
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const publish = useCallback(
    async ({ title, sectionLabel, content }) => {
      const trimmedTitle = String(title || "").trim();
      const composed = composeAnnouncementSection(sectionLabel, content);
      if (!trimmedTitle) {
        notify(t("titleCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(composed)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const { json } = await postForm("api/announcements/announcement_create_api.php", {
          title: trimmedTitle,
          content: composed,
        });
        if (json?.success) {
          notify(t("announcementPublishedSuccess"));
          await loadAnnouncements({ silent: true });
          return true;
        }
        notify(t("publishFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("publishFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadAnnouncements, notify, t],
  );

  const update = useCallback(
    async ({ id, title, sectionLabel, content }) => {
      const trimmedTitle = String(title || "").trim();
      const composed = composeAnnouncementSection(sectionLabel, content);
      if (!trimmedTitle) {
        notify(t("titleCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(composed)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const { json } = await postForm("api/announcements/announcement_update_api.php", {
          id,
          title: trimmedTitle,
          content: composed,
        });
        if (json?.success) {
          notify(t("announcementUpdatedSuccess"));
          await loadAnnouncements({ silent: true });
          return true;
        }
        notify(t("updateFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("updateFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadAnnouncements, notify, t],
  );

  const remove = useCallback(
    async (item) => {
      if (!item?.id) return false;
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const { json } = await postForm("api/announcements/announcement_delete_api.php", {
          id: item.id,
        });
        if (json?.success) {
          notify(t("announcementDeletedSuccess"));
          await loadAnnouncements({ silent: true });
          return true;
        }
        notify(t("deleteFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("failedToDelete", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadAnnouncements, notify, t],
  );

  const publishMaintenance = useCallback(
    async ({ prefix, content }) => {
      if (maintenanceList.length > 0) {
        notify(t("maintenanceNotice"), "error");
        return false;
      }
      const trimmedPrefix = String(prefix || "").trim();
      const safeContent = sanitizeRichTextHtml(content);
      if (!trimmedPrefix) {
        notify(t("prefixCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(safeContent)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const { json } = await postForm("api/maintenance/create_api.php", {
          prefix: trimmedPrefix,
          content: safeContent,
        });
        if (json?.success) {
          notify(t("maintenancePublishedSuccess"));
          await Promise.all([loadMaintenance({ silent: true }), loadMaintenanceMode()]);
          return true;
        }
        notify(t("publishFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("publishFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadMaintenance, loadMaintenanceMode, maintenanceList.length, notify, t],
  );

  const updateMaintenance = useCallback(
    async ({ id, prefix, content }) => {
      const trimmedPrefix = String(prefix || "").trim();
      const safeContent = sanitizeRichTextHtml(content);
      if (!trimmedPrefix) {
        notify(t("prefixCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(safeContent)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const { json } = await postForm("api/maintenance/update_api.php", {
          id,
          prefix: trimmedPrefix,
          content: safeContent,
        });
        if (json?.success) {
          notify(t("maintenanceUpdatedSuccess"));
          await Promise.all([loadMaintenance({ silent: true }), loadMaintenanceMode()]);
          return true;
        }
        notify(t("updateFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("updateFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadMaintenance, loadMaintenanceMode, notify, t],
  );

  const removeMaintenance = useCallback(
    async (item) => {
      if (!item?.id) return false;
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const { json } = await postForm("api/maintenance/delete_api.php", { id: item.id });
        if (json?.success) {
          notify(t("maintenanceDeletedSuccess"));
          await Promise.all([loadMaintenance({ silent: true }), loadMaintenanceMode()]);
          return true;
        }
        notify(t("deleteFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("deleteFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadMaintenance, loadMaintenanceMode, notify, t],
  );

  const toggleMaintenanceMode = useCallback(
    async (nextEnabled) => {
      if (modeSubmitting) return false;
      if (nextEnabled && maintenanceList.length === 0) {
        notify(t("modeEnableNeedsMaintenance"), "error");
        return false;
      }
      setModeSubmitting(true);
      try {
        await ensureC168DomainApiSession(meRef.current, companiesRef.current);
        const fields = { action: nextEnabled ? "enable" : "disable" };
        if (nextEnabled && maintenanceList[0]?.id) {
          fields.maintenance_id = maintenanceList[0].id;
        }
        const { json } = await postForm("api/maintenance/mode_api.php", fields);
        if (json?.success && json.data) {
          setMaintenanceMode({
            enabled: Boolean(json.data.enabled),
            maintenance_message_id: json.data.maintenance_message_id ?? null,
            message_preview: json.data.message_preview || "",
            updated_by: json.data.updated_by || "",
            updated_at: json.data.updated_at || "",
          });
          notify(nextEnabled ? t("modeEnabledSuccess") : t("modeDisabledSuccess"));
          await loadMaintenance({ silent: true });
          return true;
        }
        notify(t("modeToggleFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("modeToggleFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      } finally {
        setModeSubmitting(false);
      }
    },
    [loadMaintenance, maintenanceList, modeSubmitting, notify, t],
  );

  const toEditForm = useCallback((item) => {
    const split = splitAnnouncementSection(item?.content || "");
    return {
      id: item?.id || "",
      title: item?.title || "",
      sectionLabel: split.sectionLabel,
      content: normalizeRichTextInput(split.bodyHtml || ""),
    };
  }, []);

  const toMaintenanceEditForm = useCallback((item) => {
    return {
      id: item?.id || "",
      prefix: item?.prefix || "",
      content: normalizeRichTextInput(item?.content || ""),
    };
  }, []);

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const groupId = String(me?.login_group_id || me?.login_identifier || "").toUpperCase();

  return {
    i18n,
    t,
    lang,
    setLang,
    me,
    companyCode,
    groupId,
    announcements,
    maintenanceList,
    maintenanceMode,
    canManageMaintenanceMode,
    modeSubmitting,
    loading,
    refreshing,
    blocked,
    error,
    toast,
    notify,
    logout,
    refresh,
    publish,
    update,
    remove,
    publishMaintenance,
    updateMaintenance,
    removeMaintenance,
    toggleMaintenanceMode,
    toEditForm,
    toMaintenanceEditForm,
  };
}
