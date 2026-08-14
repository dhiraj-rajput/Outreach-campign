import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "./Sidebar";
import TourGate from "@/components/onboarding/TourGate";
import { initTheme } from "@/lib/theme";

const NO_LAYOUT_PATHS = ["/login", "/pricing"];

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    return initTheme();
  }, []);

  useEffect(() => {
    const handleRouteChange = () => setMobileOpen(false);
    router.events?.on("routeChangeComplete", handleRouteChange);
    return () => router.events?.off("routeChangeComplete", handleRouteChange);
  }, [router.events]);

  if (NO_LAYOUT_PATHS.includes(router.pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen overflow-hidden bg-base-100 flex">
      <TourGate />

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 h-full max-w-full overflow-x-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden shrink-0 h-14 px-3 flex items-center gap-3 border-b border-base-300/50 bg-base-100 z-10">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-base-content/70 hover:bg-base-200 transition-colors"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <span className="font-semibold text-sm tracking-tight">Linki</span>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-6 lg:ml-13 pb-[env(safe-area-inset-bottom,0)] max-w-full">
          <div className="max-w-[1400px] xl:max-w-[1600px] 2xl:max-w-[1800px] mx-auto w-full min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
