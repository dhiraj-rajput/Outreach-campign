// lib/pricing-plans.ts — single source of truth for what the Free vs Paid tier includes.
// Used by pages/pricing.tsx (marketing copy) and anywhere else that needs to describe
// plans consistently.

export interface PricingPlan {
  id: "free" | "paid";
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    tagline: "Get started with core outreach & CRM tooling.",
    features: [
      "Unlimited contacts, companies & lists",
      "LinkedIn & email campaign workflows",
      "Newsletters (manual content)",
      "Inbox — manual reply triage",
      "CSV import/export",
    ],
    cta: "Your current plan",
  },
  {
    id: "paid",
    name: "Paid",
    price: "$49",
    priceSuffix: "/mo",
    tagline: "Unlock AI writing, classification, and the CRM pipeline.",
    features: [
      "Everything in Free",
      "AI email & LinkedIn message writing",
      "AI newsletter generation",
      "AI reply intent classification & auto-followup",
      "CRM deal pipeline (kanban board)",
      "Priority support",
    ],
    cta: "Upgrade to Paid",
    highlighted: true,
  },
];

/** Feature blurbs shown on paywall lock overlays around specific AI actions in the app. */
export const AI_FEATURE_COPY = {
  beautify: "AI email formatting is a paid feature.",
  newsletterGenerate: "AI newsletter generation is a paid feature.",
  linkedinClassify: "AI reply classification is a paid feature.",
  agentPreview: "AI-personalized campaign copy is a paid feature.",
  pipeline: "The CRM deal pipeline is a paid feature.",
};
