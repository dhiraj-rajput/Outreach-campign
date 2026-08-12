import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  RiLayoutGridLine, RiFlowChart, RiFileList3Line, RiLogoutBoxLine,
  RiUserSettingsLine, RiArrowUpCircleLine, RiBuildingLine, RiContactsLine,
  RiInboxLine, RiCheckboxCircleLine, RiQuestionLine, RiCompassLine,
  RiPlayCircleLine, RiNewspaperLine, RiLinkedinBoxLine, RiMailSendLine,
  RiSunLine, RiMoonLine, RiComputerLine, RiCloseLine,
} from "react-icons/ri";
import { pathToTourPage, replayPageTour } from "@/lib/tour";
import { getStoredTheme, setTheme, type ThemePreference } from "@/lib/theme";

const LEARNING_PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLBf6xNJOmsIQ";

const mainNav = [
  { href: "/", label: "Dashboard", icon: RiLayoutGridLine, color: "#60a5fa", tour: "nav-dashboard" },
  { href: "/lists", label: "Lists", icon: RiFileList3Line, color: "#22c55e", tour: "nav-lists" },
  { href: "/contacts", label: "Contacts", icon: RiContactsLine, color: "#34d399", tour: "nav-contacts" },
  { href: "/companies", label: "Companies", icon: RiBuildingLine, color: "#a78bfa", tour: "nav-companies" },
  { href: "/workflows", label: "Campaigns", icon: RiFlowChart, color: "#f59e0b", tour: "nav-workflows" },
  { href: "/linkedin", label: "LinkedIn", icon: RiLinkedinBoxLine, color: "#60a5fa", tour: "nav-linkedin" },
  { href: "/email", label: "Email", icon: RiMailSendLine, color: "#38bdf8", tour: "nav-email" },
  { href: "/newsletters", label: "Newsletters", icon: RiNewspaperLine, color: "#e879f9", tour: "nav-newsletters" },
  { href: "/inbox", label: "Inbox", icon: RiInboxLine, color: "#38bdf8", tour: "nav-inbox" },
];

const premiumNav = [
  { href: "/todos", label: "Todos", icon: RiCheckboxCircleLine, color: "#fb923c", tour: "nav-todos" },
];

type Props = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export default function Sidebar({ mobileOpen = false, onMobileClose }: Props) {
  const router = useRouter();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [themePref, setThemePref] = useState<ThemePreference>("system");
  const [hasPremium, setHasPremium] = useState(true);
  const helpRef = useRef<HTMLDivElement>(null);
  const tourPage = pathToTourPage(router.pathname);
  const nav = hasPremium ? [...mainNav, ...premiumNav] : mainNav;

  useEffect(() => { setThemePref(getStoredTheme()); }, []);

  useEffect(() => {
    if (!helpOpen) return;
    function onClick(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [helpOpen]);

  useEffect(() => {
    fetch("/api/premium-status").then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHasPremium(!!d.hasPremium); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/system/update").then(r => r.json())
      .then(d => {
        setCurrentVersion(d.current ?? null);
        if (d.updateAvailable) { setUpdateAvailable(true); setLatestVersion(d.latest); }
      }).catch(() => {});
  }, []);

  function isActive(href: string) {
    if (href === "/") return router.pathname === "/";
    if (href === "/settings") return ["/settings", "/accounts"].some(p => router.pathname.startsWith(p));
    if (href === "/email") return router.pathname === "/email";
    return router.pathname.startsWith(href);
  }

  function cycleTheme() {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(themePref) + 1) % order.length];
    setThemePref(next);
    setTheme(next);
  }

  const ThemeIcon = themePref === "light" ? RiSunLine : themePref === "dark" ? RiMoonLine : RiComputerLine;
  const themeLabel = themePref === "light" ? "Light" : themePref === "dark" ? "Dark" : "System";

  function NavLinks({ labels }: { labels: boolean }) {
    return (
      <>
        <nav className="flex-1 py-3 flex flex-col gap-0.5 px-1.5 overflow-y-auto">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.tour}
                title={!labels ? item.label : undefined}
                onClick={onMobileClose}
                className={`flex items-center gap-3 h-10 rounded-lg transition-colors ${
                  labels ? "px-2.5" : "justify-center"
                } ${
                  active
                    ? "text-base-content bg-base-300/70"
                    : "text-base-content/45 hover:text-base-content/80 hover:bg-base-300/40"
                }`}
              >
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: active ? `${item.color}22` : "transparent" }}
                >
                  <item.icon size={15} style={{ color: active ? item.color : "currentColor" }} />
                </span>
                {labels && <span className="text-sm font-medium truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="pb-3 border-t border-base-300/50 pt-3 flex flex-col gap-0.5 px-1.5">
          <button
            type="button"
            onClick={cycleTheme}
            title={`Theme: ${themeLabel}`}
            className={`flex items-center gap-3 h-10 rounded-lg text-base-content/45 hover:text-base-content/80 hover:bg-base-300/40 transition-colors ${
              labels ? "px-2.5" : "justify-center"
            }`}
          >
            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
              <ThemeIcon size={15} />
            </span>
            {labels && <span className="text-sm">Theme · {themeLabel}</span>}
          </button>

          <div className="relative" ref={helpRef}>
            <button
              type="button"
              onClick={() => setHelpOpen(v => !v)}
              title={!labels ? "Help" : undefined}
              className={`flex items-center gap-3 h-10 rounded-lg transition-colors w-full ${
                labels ? "px-2.5" : "justify-center"
              } ${helpOpen ? "text-base-content bg-base-300/40" : "text-base-content/45 hover:text-base-content/80 hover:bg-base-300/40"}`}
            >
              <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
                <RiQuestionLine size={15} />
              </span>
              {labels && <span className="text-sm">Help</span>}
            </button>
            {helpOpen && (
              <div className={`absolute ${labels ? "left-0 bottom-12 w-full" : "left-11 bottom-0 w-52"} bg-base-200 border border-base-300/60 rounded-xl shadow-xl py-1.5 flex flex-col z-40`}>
                {tourPage && (
                  <button
                    type="button"
                    onClick={() => { replayPageTour(tourPage); setHelpOpen(false); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-base-content/70 hover:text-base-content hover:bg-base-300/40 text-left"
                  >
                    <RiCompassLine size={14} className="text-base-content/40 shrink-0" />
                    Show me around this page
                  </button>
                )}
                <a
                  href={LEARNING_PLAYLIST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setHelpOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-base-content/70 hover:text-base-content hover:bg-base-300/40"
                >
                  <RiPlayCircleLine size={14} className="text-base-content/40 shrink-0" />
                  Video guides
                </a>
              </div>
            )}
          </div>

          <Link
            href="/settings"
            data-tour="nav-settings"
            title={!labels ? "Settings" : undefined}
            onClick={onMobileClose}
            className={`flex items-center gap-3 h-10 rounded-lg transition-colors ${
              labels ? "px-2.5" : "justify-center"
            } ${isActive("/settings") ? "text-base-content bg-base-300/70" : "text-base-content/45 hover:text-base-content/80 hover:bg-base-300/40"}`}
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
            className={`flex items-center gap-3 h-10 rounded-lg text-base-content/45 hover:text-error/80 hover:bg-error/5 transition-colors ${
              labels ? "px-2.5" : "justify-center"
            }`}
          >
            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
              <RiLogoutBoxLine size={15} />
            </span>
            {labels && <span className="text-sm">Sign out</span>}
          </button>
        </div>

        {labels && (
          <div className="px-4 py-3 border-t border-base-300/50">
            {updateAvailable && (
              <div className="mb-2 px-2.5 py-2 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-center gap-1.5 text-warning text-xs font-medium">
                  <RiArrowUpCircleLine size={13} /> Update available
                </div>
                <p className="text-warning/70 text-[11px] mt-0.5">v{latestVersion} is out</p>
              </div>
            )}
            {currentVersion && <p className="text-[10px] text-base-content/30 mb-0.5">v{currentVersion}</p>}
            <a
              href="https://opsily.com?utm_source=linki&utm_medium=app&utm_campaign=sidebar"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-base-content/30 hover:text-base-content/50"
            >
              Built by opsily.com
            </a>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Desktop rail */}
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen w-13 z-20"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="w-13 shrink-0 bg-base-200 border-r border-base-300/50 flex flex-col h-full">
          <div className="shrink-0 h-13 flex items-center justify-center border-b border-base-300/50">
            <Image src="/logo_linki.png" alt="Linki" width={22} height={22} className="rounded-md opacity-90" />
          </div>
          <NavLinks labels={false} />
          {updateAvailable && (
            <div className="flex justify-center mb-2" title={`v${latestVersion} available`}>
              <RiArrowUpCircleLine size={15} className="text-warning" />
            </div>
          )}
        </div>

        {/* Hover labels */}
        <div
          className={`absolute left-13 top-0 h-full w-48 bg-base-200 border-r border-base-300/50 shadow-xl flex flex-col transition-all duration-150 ${
            hovered ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-2 pointer-events-none"
          }`}
          style={{ borderRadius: "0 12px 12px 0" }}
        >
          <div className="shrink-0 h-13 flex items-center px-4 border-b border-base-300/50">
            <span className="font-semibold text-sm tracking-wide">Linki</span>
          </div>
          <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm transition-colors ${
                    active ? "bg-base-300 text-base-content" : "text-base-content/55 hover:text-base-content/85 hover:bg-base-300/40"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: item.color }} />
                  )}
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="pb-3 border-t border-base-300/50 pt-3 flex flex-col gap-0.5 px-2">
            <button type="button" onClick={cycleTheme}
              className="flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-base-content/55 hover:text-base-content/85 hover:bg-base-300/40 text-left">
              <ThemeIcon size={14} className="shrink-0 opacity-70" /> Theme · {themeLabel}
            </button>
            <Link href="/settings"
              className={`relative flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm transition-colors ${
                isActive("/settings") ? "bg-base-300 text-base-content" : "text-base-content/55 hover:text-base-content/85 hover:bg-base-300/40"
              }`}>
              Settings
            </Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-base-content/55 hover:text-error/80 hover:bg-error/5 text-left">
              Sign out
            </button>
          </div>
          <div className="px-4 py-3 border-t border-base-300/50">
            {currentVersion && <p className="text-[10px] text-base-content/30 mb-0.5">v{currentVersion}</p>}
            <a href="https://opsily.com?utm_source=linki&utm_medium=app&utm_campaign=sidebar"
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-base-content/30 hover:text-base-content/50">
              Built by opsily.com
            </a>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-[min(280px,85vw)] z-40 bg-base-200 border-r border-base-300/50 flex flex-col transition-transform duration-200 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="shrink-0 h-12 flex items-center justify-between px-4 border-b border-base-300/50">
          <div className="flex items-center gap-2.5">
            <Image src="/logo_linki.png" alt="Linki" width={20} height={20} className="rounded-md" />
            <span className="font-semibold text-sm">Linki</span>
          </div>
          <button type="button" onClick={onMobileClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-base-content/60 hover:bg-base-300/50"
            aria-label="Close menu">
            <RiCloseLine size={18} />
          </button>
        </div>
        <NavLinks labels={true} />
      </aside>
    </>
  );
}
