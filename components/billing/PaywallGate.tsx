import { ReactNode } from "react";
import Link from "next/link";
import { RiLockLine } from "react-icons/ri";
import { useBillingStatus } from "./useBillingStatus";

type Props = {
  /** The AI/paid feature to gate. Rendered as-is once the user is confirmed paid. */
  children: ReactNode;
  /** Short description of what's being unlocked, e.g. "AI email formatting". */
  feature: string;
  /** "overlay" dims + locks the content in place (good for buttons/panels).
   *  "inline" replaces the content entirely with a compact upsell row (good for small
   *  actions like a single icon button). Defaults to "overlay". */
  variant?: "overlay" | "inline";
  className?: string;
};

/**
 * Client-side paywall gate for AI features. This is a UX convenience only — every route
 * this protects (beautify-email, ai-generate, linkedin-classify, agent/preview, pipeline)
 * also enforces the same rule server-side via lib/access.ts's requirePaidAccess, so
 * bypassing this component client-side would still get a 402 from the API.
 */
export default function PaywallGate({ children, feature, variant = "overlay", className = "" }: Props) {
  const { status, loading } = useBillingStatus();

  // While loading, or if we couldn't determine status, don't flash a locked state —
  // render nothing gated yet to avoid a layout jump once the real status arrives.
  if (loading) return null;
  if (status?.isPaid) return <>{children}</>;

  if (variant === "inline") {
    return (
      <Link
        href="/pricing"
        className={`inline-flex items-center gap-1.5 text-xs font-medium text-base-content/50 hover:text-primary transition-colors ${className}`}
        title={`${feature} — upgrade to unlock`}
      >
        <RiLockLine size={13} />
        <span>{feature}</span>
      </Link>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none select-none opacity-40 blur-[1.5px]">{children}</div>
      <Link
        href="/pricing"
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-base-200/70 backdrop-blur-sm border border-base-300/60 text-center px-4 hover:bg-base-200/85 transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <RiLockLine size={16} />
        </span>
        <span className="text-xs font-medium text-base-content/80">{feature}</span>
        <span className="text-[11px] text-primary font-medium">Upgrade to unlock →</span>
      </Link>
    </div>
  );
}
