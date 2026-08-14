import Head from "next/head";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Toaster } from "sonner";
import { getStoredTheme } from "@/lib/theme";

const PUBLIC_PATHS = ["/login", "/pricing"];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session && !PUBLIC_PATHS.includes(router.pathname)) {
      router.replace("/login");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <span className="loading loading-spinner loading-sm text-base-content/40" />
      </div>
    );
  }

  if (!session && !PUBLIC_PATHS.includes(router.pathname)) return null;
  return <>{children}</>;
}

function ThemedToaster() {
  const [theme, setThemeState] = useState<"light" | "dark">(() => (typeof window !== "undefined" ? getStoredTheme() : "dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const t = document.documentElement.getAttribute("data-theme");
      setThemeState(t === "linki-light" ? "light" : "dark");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return <Toaster theme={theme} position="bottom-right" richColors closeButton />;
}

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <AuthGuard>
        <Layout>
          <Component {...pageProps} />
          <ThemedToaster />
        </Layout>
      </AuthGuard>
    </SessionProvider>
  );
}
