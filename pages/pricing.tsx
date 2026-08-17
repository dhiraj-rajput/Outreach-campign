import Head from "next/head";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { RiCheckLine, RiVipCrownLine } from "react-icons/ri";
import { toast } from "sonner";
import { PRICING_PLANS } from "@/lib/pricing-plans";
import { useBillingStatus } from "@/components/billing/useBillingStatus";

export default function PricingPage() {
  const { data: session } = useSession();
  const { status, refresh } = useBillingStatus();
  const [upgrading, setUpgrading] = useState<"self" | "org" | null>(null);

  async function handleUpgrade(scope: "self" | "org") {
    const target = scope === "org" ? (status?.orgName ?? "your organization") : "your account";
    const confirmed = window.confirm(
      `Activate the Paid plan for ${target}?\n\nNo payment gateway is connected yet, so this won't charge a card — it just flips the plan flag so paid features unlock immediately. An admin can revert this any time from the Admin panel.`
    );
    if (!confirmed) return;

    setUpgrading(scope);
    try {
      const r = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upgrade failed");
      toast.success(scope === "org" ? "Organization upgraded to Paid!" : "You're upgraded to Paid!");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  }

  const isPaid = status?.isPaid ?? false;

  return (
    <>
      <Head><title>Pricing · Linki</title></Head>
      <div className="min-h-screen bg-base-100">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
        {session && (
          <a href="/" className="text-sm text-base-content/50 hover:text-base-content mb-6 inline-block">← Back to dashboard</a>
        )}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-base-content/60 mt-2">
            Free to run outreach campaigns. Upgrade to unlock AI writing, classification, and the CRM pipeline.
          </p>
          {status?.isSuperAdmin && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full px-3 py-1">
              <RiVipCrownLine size={13} /> Super admin — you already have access to every feature
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {PRICING_PLANS.map((plan) => {
            const isCurrentPlan =
              (plan.id === "free" && !isPaid) || (plan.id === "paid" && isPaid);
            return (
              <div
                key={plan.id}
                className={`surface rounded-xl p-6 flex flex-col ${
                  plan.highlighted ? "border-2 border-primary" : "border border-base-300/60"
                }`}
              >
                {plan.highlighted && (
                  <span className="self-start text-[11px] font-semibold tracking-wide uppercase text-primary bg-primary/10 rounded-full px-2.5 py-1 mb-3">
                    Recommended
                  </span>
                )}
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="text-sm text-base-content/60 mt-1">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">{plan.price}</span>
                  {plan.priceSuffix && <span className="text-base-content/50 text-sm">{plan.priceSuffix}</span>}
                </div>

                <ul className="mt-5 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-base-content/80">
                      <RiCheckLine className="text-accent mt-0.5 shrink-0" size={15} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 space-y-2">
                  {!session ? (
                    <a href="/login" className="btn btn-block btn-sm">Sign in to continue</a>
                  ) : isCurrentPlan ? (
                    <button type="button" disabled className="btn btn-block btn-sm btn-disabled">
                      Your current plan
                    </button>
                  ) : plan.id === "paid" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleUpgrade("self")}
                        disabled={upgrading !== null}
                        className="btn btn-primary btn-block btn-sm"
                      >
                        {upgrading === "self" ? "Upgrading…" : "Upgrade me"}
                      </button>
                      {status?.orgId && (
                        <button
                          type="button"
                          onClick={() => handleUpgrade("org")}
                          disabled={upgrading !== null}
                          className="btn btn-outline btn-block btn-sm"
                        >
                          {upgrading === "org" ? "Upgrading…" : `Upgrade ${status.orgName ?? "organization"}`}
                        </button>
                      )}
                    </>
                  ) : (
                    <button type="button" disabled className="btn btn-block btn-sm btn-disabled">
                      Downgrade in Settings
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-base-content/40 mt-8">
          Billing is self-serve for now while payment processing is being finalized — upgrades take effect immediately.
          {status?.orgId ? " " : " Want to share a plan with your team? Set up an organization in "}
          {!status?.orgId && <a href="/organization" className="link">Organization settings</a>}
          {!status?.orgId && "."}
        </p>
      </div>
      </div>
    </>
  );
}
