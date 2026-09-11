import { useCallback, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import MobileSubpageHeader from "../../components/layout/MobileSubpageHeader.jsx";
import ScopeBreadcrumb from "../dashboard/ScopeBreadcrumb.jsx";
import { useIncrementalList } from "../../hooks/useIncrementalList.js";
import { useMobileAdminUsers } from "../../hooks/useMobileAdminUsers.js";
import { AccountScopeSheet } from "../account/AccountSheets.jsx";
import { UserFormSheet } from "./AdminUserSheets.jsx";
import "../account/account.css";
import "./admin.css";

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`m-account-chip tap-scale${active ? " is-active" : ""}`}
    >
      <span className="m-account-chip-dot" aria-hidden="true">
        <i className="fas fa-check" />
      </span>
      <span className="m-account-chip-label">{children}</span>
    </button>
  );
}

function UserCard({ row, admin, onOpen }) {
  const { i18n } = admin;
  const code = String(row.login_id || "").toUpperCase();
  const name = String(row.name || "").trim();
  const roleText = [
    row.role ? String(row.role) : "",
    row.is_owner_shadow ? "OWNER" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="m-user-card tap-scale"
      aria-label={`${i18n.tapForDetail}: ${code}`}
    >
      <span className="m-user-card-avatar" aria-hidden="true">
        {code.slice(0, 2)}
      </span>
      <span className="m-user-card-copy">
        <strong>
          {code}
          {name && name.toUpperCase() !== code ? <span>{name}</span> : null}
        </strong>
        {roleText ? <small>{roleText}</small> : null}
      </span>
      <i className="fas fa-chevron-right" aria-hidden="true" />
    </button>
  );
}

export default function AdminUsersPage() {
  const admin = useMobileAdminUsers();
  const { i18n } = admin;
  const [scopeOpen, setScopeOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const { visible, hasMore, sentinelRef } = useIncrementalList(admin.users, 60);

  const companyCode = String(admin.selectedCompany?.company_id || "").toUpperCase();
  const groupId = String(
    admin.selectedGroup ||
      admin.selectedCompany?.group_id ||
      admin.selectedCompany?.link_source_group ||
      "",
  )
    .trim()
    .toUpperCase();

  const scopeCompany = admin.groupsAllMode || admin.groupAllMode
    ? i18n.all
    : admin.companyId
      ? companyCode
      : groupId;
  const sidebarGroup = admin.companyId ? groupId : "";
  const overlayOpen = scopeOpen || formOpen;

  const openCardEdit = useCallback(
    async (row) => {
      await admin.loadDetail(row);
      if (await admin.openEdit(row)) setFormOpen(true);
    },
    [admin],
  );

  const stickyBar = (
    <div className="m-account-sticky">
      <MobileSubpageHeader
        backTo="/more"
        backAriaLabel={i18n.backToMore}
        title={i18n.users}
      />
      <div className="m-account-scope-row">
        <button type="button" className="m-account-scope-btn tap-scale" onClick={() => setScopeOpen(true)}>
          <ScopeBreadcrumb
            i18n={i18n}
            groupId={groupId}
            companyCode={companyCode}
            groupsAllMode={admin.groupsAllMode}
            groupAllMode={admin.groupAllMode}
            groupOnlyMode={!admin.companyId && Boolean(groupId)}
          />
          <i className="fas fa-sliders" aria-hidden="true" />
        </button>
      </div>
      <label className="m-account-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          value={admin.search}
          onChange={(e) => admin.setSearch(e.target.value)}
          placeholder={i18n.searchUsers}
        />
      </label>
      <div className="m-account-chips">
        <Chip
          active={admin.showInactive}
          onClick={() => admin.setShowInactive((value) => !value)}
        >
          {i18n.showInactive}
        </Chip>
      </div>
    </div>
  );

  if (admin.blocked) return null;

  return (
    <MobileShell
      i18n={i18n}
      me={admin.me}
      companyCode={scopeCompany}
      groupId={sidebarGroup}
      onLogout={admin.logout}
      onRefresh={admin.refresh}
      refreshing={admin.refreshing}
      stickyBar={stickyBar}
      lang={admin.lang}
      onLangChange={admin.setLang}
      overlayOpen={overlayOpen}
      floatingAction={
        <button
          type="button"
          className="m-account-fab tap-scale"
          disabled={!admin.canMutate}
          onClick={async () => {
            if (await admin.openCreate()) setFormOpen(true);
          }}
          aria-label={i18n.addUser}
        >
          <i className="fas fa-plus" aria-hidden="true" />
        </button>
      }
      overlay={
        <>
          <AccountScopeSheet open={scopeOpen} onClose={() => setScopeOpen(false)} account={admin} />
          <UserFormSheet open={formOpen} onClose={() => setFormOpen(false)} admin={admin} />
        </>
      }
    >
      <div className="m-account-page">
        {admin.toast ? (
          <div className={`m-account-toast ${admin.toast.tone}`}>{admin.toast.message}</div>
        ) : null}
        {admin.error ? <div className="m-account-error">{admin.error}</div> : null}
        {admin.loading ? (
          <div className="m-account-loading">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            <span>{i18n.loadingUsers}</span>
          </div>
        ) : admin.users.length ? (
          <div className="m-account-list">
            {visible.map((row) => (
              <UserCard key={`${row.id}-${row.is_owner_shadow ? "s" : "u"}`} row={row} admin={admin} onOpen={openCardEdit} />
            ))}
            {hasMore ? <div ref={sentinelRef} className="m-admin-sentinel" aria-hidden="true" /> : null}
          </div>
        ) : (
          <div className="m-account-empty">
            <i className="fas fa-users" aria-hidden="true" />
            <p>{i18n.noUsers}</p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
