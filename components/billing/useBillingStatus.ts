import { useEffect, useState } from "react";

export interface BillingStatus {
  userId: string;
  email: string;
  role: "user" | "super_admin";
  isSuperAdmin: boolean;
  userPlan: "free" | "paid";
  orgId: string | null;
  orgName: string | null;
  orgPlan: "free" | "paid" | null;
  orgRole: "owner" | "admin" | "member" | null;
  isPaid: boolean;
}

/** Client-side hook mirroring lib/access.ts's AccessContext. Used by paywall UI
 *  (PaywallGate, Sidebar, pricing page) to decide what to show. The API route it calls
 *  (/api/billing/status) is the source of truth — this never trusts client state for
 *  actually enforcing access, only for UI decisions. */
export function useBillingStatus() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, loading, refresh };
}
