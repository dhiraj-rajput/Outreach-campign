import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  RiLayoutGridLine, RiFlowChart, RiFileList3Line, RiLogoutBoxLine,
  RiUserSettingsLine, RiBuildingLine, RiContactsLine,
  RiInboxLine, RiCheckboxCircleLine,
  RiNewspaperLine, RiLinkedinBoxLine, RiMailSendLine,
  RiSunLine, RiMoonLine, RiCloseLine, RiKanbanView, RiShieldStarLine, RiLockLine, RiVipCrownLine,
} from "react-icons/ri";
import { getStoredTheme, setTheme, type ThemePreference } from "@/lib/theme";

const mainNav = [
  { href: "/", label: "Dashboard", icon: RiLayoutGridLine, tour: "nav-dashboard" },
  { href: "/lists", label: "Lists", icon: RiFileList3Line, tour: "nav-lists" },
  { href: "/contacts", label: "Contacts", icon: RiContactsLine, tour: "nav-contacts" },
  { href: "/companies", label: "Companies", icon: RiBuildingLine, tour: "nav-companies" },
  { href: "/workflows", label: "Campaigns", icon: RiFlowChart, tour: "nav-workflows" },
];

const channelNav = [
  { href: "/linkedin", label: "LinkedIn", icon: RiLinkedinBoxLine, tour: "nav-linkedin" },
  { href: "/email", label: "Email", icon: RiMailSendLine, tour: "nav-email" },
  { href: "/newsletters", label: "Newsletters", icon: RiNewspaperLine, tour: "nav-newsletters" },
  { href: "/inbox", label: "Inbox", icon: RiInboxLine, tour: "nav-inbox" },
];

const premiumNav = [
  { href: "/todos", label: "Todos", icon: RiCheckboxCircleLine, tour: "nav-todos" },
];

const pipelineNav = { href: "/pipeline", label: "Pipeline", icon: RiKanbanView, tour: "nav-pipeline" };
const pricingNav = { href: "/pricing", label: "Pricing", icon: RiVipCrownLine, tour: "nav-pricing" };
const orgNav = { href: "/organization", label: "Organization", icon: RiBuildingLine, tour: "nav-organization" };

type Props = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export default function Sidebar({ mobileOpen = false, onMobileClose }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [themePref, setThemePref] = useState<ThemePreference>(() => (typeof window !== "undefined" ? getStoredTheme() : "dark"));
  const [hasPremium, setHasPremium] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasOrgAccess, setHasOrgAccess] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/premium-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setHasPremium(!!d.hasPremium);
      })
      .catch(() => {});
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setIsPaid(!!d.isPaid);
          setIsSuperAdmin(!!d.isSuperAdmin);
          setHasOrgAccess(Boolean(d.hasOrgAccess));
          setOrgId(d.orgId ?? null);
          setOrgRole(d.orgRole ?? null);
        }
      })
      .catch(() => {});
  }, []);

  function isActive(href: string) {
    if (href === "/") return router.pathname === "/";
    if (href === "/organization") return router.pathname.startsWith("/organization");
    if (href === "/settings") return ["/settings", "/accounts"].some((p) => router.pathname.startsWith(p));
    if (href === "/email") return router.pathname === "/email";
    return router.pathname.startsWith(href);
  }

  function cycleTheme() {
    const next: ThemePreference = themePref === "dark" ? "light" : "dark";
    setThemePref(next);
    setTheme(next);
  }

  const ThemeIcon = themePref === "light" ? RiSunLine : RiMoonLine;
  const themeLabel = themePref === "light" ? "Light" : "Dark";

  function renderNavLink(item: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; tour?: string }, labels: boolean, locked?: boolean, badge?: string) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={locked ? "/pricing" : item.href}
        data-tour={item.tour}
        title={!labels ? item.label : locked ? `${item.label} — upgrade to unlock` : undefined}
        onClick={onMobileClose}
        className={`nav-item ${labels ? "px-2.5" : "justify-center"} ${active ? "active" : ""}`}
      >
        <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
          <Icon size={15} />
        </span>
        {labels && <span className="text-sm font-medium truncate flex-1">{item.label}</span>}
        {labels && locked && <RiLockLine size={12} className="text-base-content/35 shrink-0" />}
        {labels && badge && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/40 bg-base-300/60 rounded px-1.5 py-0.5 shrink-0">
            {badge}
          </span>
        )}
      </Link>
    );
  }

  function renderNavLinks(labels: boolean) {
    return (
      <>
        <nav className="flex-1 py-2 flex flex-col overflow-y-auto">
          {labels && <div className="nav-group-label">Overview</div>}
          <div className="flex flex-col gap-0.5 px-1.5">
            {mainNav.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={item.tour}
                  title={!labels ? item.label : undefined}
                  onClick={onMobileClose}
                  className={`nav-item ${labels ? "px-2.5" : "justify-center"} ${active ? "active" : ""}`}
                >
                  <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
                    <Icon size={15} />
                  </span>
                  {labels && <span className="text-sm font-medium truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {labels && <div className="nav-group-label">Channels</div>}
          <div className="flex flex-col gap-0.5 px-1.5 mt-1">
            {channelNav.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={item.tour}
                  title={!labels ? item.label : undefined}
                  onClick={onMobileClose}
                  className={`nav-item ${labels ? "px-2.5" : "justify-center"} ${active ? "active" : ""}`}
                >
                  <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
                    <Icon size={15} />
                  </span>
                  {labels && <span className="text-sm font-medium truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {hasPremium && (
            <>
              {labels && <div className="nav-group-label">Premium</div>}
              <div className="flex flex-col gap-0.5 px-1.5 mt-1">
                {premiumNav.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-tour={item.tour}
                      title={!labels ? item.label : undefined}
                      onClick={onMobileClose}
                      className={`nav-item ${labels ? "px-2.5" : "justify-center"} ${active ? "active" : ""}`}
                    >
                      <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
                        <Icon size={15} />
                      </span>
                      {labels && <span className="text-sm font-medium truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {labels && <div className="nav-group-label">CRM</div>}
          <div className="flex flex-col gap-0.5 px-1.5 mt-1">
            {renderNavLink(pipelineNav, labels, !isPaid)}
          </div>

          {labels && <div className="nav-group-label">Billing</div>}
          <div className="flex flex-col gap-0.5 px-1.5 mt-1">
            {renderNavLink(pricingNav, labels, false, isPaid ? "Paid" : "Free")}
          </div>

          {hasOrgAccess && Boolean(orgId) && (isSuperAdmin || orgRole === "owner" || orgRole === "admin") && (
            <>
              {labels && <div className="nav-group-label">Workspace</div>}
              <div className="flex flex-col gap-0.5 px-1.5 mt-1">
                {renderNavLink(orgNav, labels, false, orgRole ? (orgRole === "owner" ? "Owner" : "Admin") : undefined)}
              </div>
            </>
          )}
        </nav>

        <div className="pb-2 border-t border-base-300/40 pt-2 flex flex-col gap-0.5 px-1.5">
          <button
            type="button"
            onClick={cycleTheme}
            title={`Theme: ${themeLabel}`}
            className={`nav-item ${labels ? "px-2.5" : "justify-center"}`}
          >
            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
              <ThemeIcon size={15} />
            </span>
            {labels && <span className="text-sm">Theme · {themeLabel}</span>}
          </button>

          <Link
            href="/settings"
            data-tour="nav-settings"
            title={!labels ? "Settings" : undefined}
            onClick={onMobileClose}
            className={`nav-item ${labels ? "px-2.5" : "justify-center"} ${isActive("/settings") ? "active" : ""}`}
          >
            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
              <RiUserSettingsLine size={15} />
            </span>
            {labels && <span className="text-sm font-medium">Settings</span>}
          </Link>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={!labels ? "Sign out" : undefined}
            className={`nav-item ${labels ? "px-2.5" : "justify-center"} hover:!text-error/80! hover:!bg-error/5!`}
          >
            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
              <RiLogoutBoxLine size={15} />
            </span>
            {labels && <span className="text-sm">Sign out</span>}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop rail — expands on hover */}
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen z-20"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="w-13 shrink-0 bg-base-200 border-r border-base-300/40 flex flex-col h-full">
          <div className="shrink-0 h-12 flex items-center justify-center border-b border-base-300/40">
            <Image src="/logo_linki.png" alt="Linki" width={20} height={20} className="rounded-md opacity-90" />
          </div>
          {renderNavLinks(false)}
        </div>

        {/* Hover expand panel */}
        <div
          className={`absolute left-13 top-0 h-full w-52 bg-base-200 border-r border-base-300/40 shadow-xl flex flex-col transition-all duration-150 ${
            hovered ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-1 pointer-events-none"
          }`}
          style={{ borderRadius: "0 10px 10px 0" }}
        >
          <div className="shrink-0 h-12 flex items-center px-4 border-b border-base-300/40">
            <span className="font-semibold text-sm tracking-tight">Linki</span>
          </div>
          {renderNavLinks(true)}
        </div>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-[min(280px,85vw)] z-40 bg-base-200 border-r border-base-300/40 flex flex-col transition-transform duration-200 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="shrink-0 h-12 flex items-center justify-between px-4 border-b border-base-300/40">
          <div className="flex items-center gap-2.5">
            <Image src="/logo_linki.png" alt="Linki" width={20} height={20} className="rounded-md" />
            <span className="font-semibold text-sm tracking-tight">Linki</span>
          </div>
          <button
            type="button"
            onClick={onMobileClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-base-content/60 hover:bg-base-300/50"
            aria-label="Close menu"
          >
            <RiCloseLine size={18} />
          </button>
        </div>
        {renderNavLinks(true)}
      </aside>
    </>
  );
}
