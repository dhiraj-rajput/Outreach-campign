import Head from "next/head";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { RiCheckLine, RiVipCrownLine, RiBuildingLine, RiUserLine, RiSparklingLine, RiShieldCheckLine } from "react-icons/ri";
import { toast } from "sonner";
import { INDIVIDUAL_PLANS, ORGANIZATION_PLANS, type PricingPlan } from "@/lib/pricing-plans";
import { useBillingStatus } from "@/components/billing/useBillingStatus";

export default function PricingPage() {
  const { data: session } = useSession();
  const { status, refresh } = useBillingStatus();
  const [tab, setTab] = useState<"individual" | "org">("individual");
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const isSuperAdmin = Boolean(status?.isSuperAdmin);
  const isUserPaid = Boolean(status?.userPlan === "paid" || status?.isPaid);
  const isOrgPaid = Boolean(status?.orgPlan === "paid" || status?.hasOrgAccess);

  async function handleUpgrade(scope: "self" | "org", plan: PricingPlan) {
    if (!session) {
      window.location.href = "/login";
      return;
    }

    const targetDesc = scope === "org"
      ? (status?.orgName ? `Organization "${status.orgName}"` : "your new Team Workspace")
      : "your personal account";

    const confirmed = window.confirm(
      `Activate the ${plan.name} plan for ${targetDesc}?\n\nThis immediately unlocks ${scope === "org" ? "Organization Workspace, Team Invite Codes, and" : ""} all premium features.`
    );
    if (!confirmed) return;

    setUpgrading(plan.id);
    try {
      const r = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, planId: plan.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upgrade failed");
      toast.success(scope === "org" ? "Team Workspace activated!" : `Upgraded to ${plan.name}!`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  }

  const activePlans = tab === "individual" ? INDIVIDUAL_PLANS : ORGANIZATION_PLANS;

  return (
    <>
      <Head>
        <title>Pricing & Plans — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-4 space-y-6">
        {/* Compact Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <RiSparklingLine size={13} /> Transparent, Scalable Plans
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-base-content">
            Predictable Plans for Every Stage
          </h1>
          <p className="text-xs sm:text-sm text-base-content/60">
            Scale outreach velocity effortlessly with AI copywriting, reply classification, and collaborative team workspaces.
          </p>

          {isSuperAdmin && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-3.5 py-1 mt-1">
              <RiVipCrownLine size={13} /> Super admin — you have unrestricted access to all features
            </div>
          )}
        </div>

        {/* Tab Toggle: Individual vs Organization */}
        <div className="flex justify-center">
          <div className="bg-base-200 border border-base-300 p-1 rounded-xl inline-flex items-center gap-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab("individual")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                tab === "individual"
                  ? "bg-primary text-primary-content shadow-sm"
                  : "text-base-content/60 hover:text-base-content hover:bg-base-300/40"
              }`}
            >
              <RiUserLine size={15} /> Individual Plans (3)
            </button>
            <button
              type="button"
              onClick={() => setTab("org")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                tab === "org"
                  ? "bg-primary text-primary-content shadow-sm"
                  : "text-base-content/60 hover:text-base-content hover:bg-base-300/40"
              }`}
            >
              <RiBuildingLine size={15} /> Organization & Teams (3)
            </button>
          </div>
        </div>

        {/* Scope Context Info */}
        <div className="text-center">
          {tab === "individual" ? (
            <p className="text-xs text-base-content/50">
              For solo founders, consultants, and individual sales reps looking for high-velocity outreach without team overhead.
            </p>
          ) : (
            <p className="text-xs text-primary font-medium flex items-center justify-center gap-1.5">
              <RiShieldCheckLine size={14} /> Team plans activate Organization Management in Settings, team invite codes, and shared workspaces.
            </p>
          )}
        </div>

        {/* 3-Column Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {activePlans.map((plan) => {
            const isHighlighted = Boolean(plan.highlighted);
            const isCurrent =
              tab === "individual"
                ? plan.id === "free" ? !isUserPaid : isUserPaid
                : isOrgPaid;

            return (
              <div
                key={plan.id}
                className={`surface rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 ${
                  isHighlighted
                    ? "border-2 border-primary shadow-lg ring-1 ring-primary/20 relative bg-base-100"
                    : "border border-base-300 hover:border-base-content/20 shadow-sm"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-base-content">{plan.name}</h2>
                    {isHighlighted && (
                      <span className="text-[10px] font-bold tracking-wider uppercase bg-primary text-primary-content px-2.5 py-0.5 rounded-full shadow-xs">
                        Popular
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-base-content/60 min-h-[32px]">{plan.tagline}</p>

                  <div className="mt-4 pb-4 border-b border-base-300/50 flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-base-content">
                      {plan.price}
                    </span>
                    {plan.priceSuffix && (
                      <span className="text-xs sm:text-sm font-medium text-base-content/50">
                        {plan.priceSuffix}
                      </span>
                    )}
                  </div>

                  {/* Feature list */}
                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs sm:text-sm text-base-content/80">
                        <RiCheckLine className="text-success mt-0.5 shrink-0" size={16} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Card CTA button */}
                <div className="mt-6 pt-4 border-t border-base-300/30">
                  {isSuperAdmin ? (
                    <button type="button" disabled className="btn btn-sm btn-disabled w-full">
                      Included in Super Admin
                    </button>
                  ) : isCurrent && plan.id === "free" ? (
                    <button type="button" disabled className="btn btn-sm btn-disabled w-full">
                      Current Plan
                    </button>
                  ) : isCurrent && isOrgPaid && tab === "org" ? (
                    <button type="button" disabled className="btn btn-sm btn-outline btn-success w-full">
                      Active Team Plan
                    </button>
                  ) : isCurrent && isUserPaid && tab === "individual" ? (
                    <button type="button" disabled className="btn btn-sm btn-outline btn-success w-full">
                      Active Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUpgrade(plan.scope === "org" ? "org" : "self", plan)}
                      disabled={upgrading !== null}
                      className={`btn btn-sm w-full font-medium ${
                        isHighlighted ? "btn-primary" : "btn-outline border-base-300 hover:bg-base-200"
                      }`}
                    >
                      {upgrading === plan.id ? "Activating…" : plan.cta}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="text-center pt-4">
          <p className="text-[11px] text-base-content/40">
            All plans include core outreach campaigns and CSV contact management. Team plans automatically provision shared organization access.
          </p>
        </div>
      </div>
    </>
  );
}
