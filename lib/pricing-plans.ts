// lib/pricing-plans.ts — single source of truth for what the Free vs Paid tier includes.
// Used by pages/pricing.tsx (marketing copy) and anywhere else that needs to describe
// plans consistently.

export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  scope: "individual" | "org";
}

export const INDIVIDUAL_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free Starter",
    price: "$0",
    tagline: "Essential outreach & CRM for solo creators.",
    scope: "individual",
    features: [
      "Unlimited contacts, companies & lists",
      "LinkedIn & email campaign workflows",
      "Manual reply triage in unified inbox",
      "CSV lead import & export",
      "Basic contact insights",
    ],
    cta: "Your current plan",
  },
  {
    id: "individual_pro",
    name: "Individual Pro",
    price: "$29",
    priceSuffix: "/mo",
    tagline: "AI automation & full CRM pipeline for solo operators.",
    scope: "individual",
    highlighted: true,
    features: [
      "Everything in Free",
      "AI email & LinkedIn message copywriter",
      "AI intent classification & reply scoring",
      "Full CRM deal pipeline (Kanban board)",
      "Automated reply triage",
      "Fast delivery queue",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "individual_power",
    name: "Individual Power",
    price: "$59",
    priceSuffix: "/mo",
    tagline: "Maximum outreach velocity & advanced AI features.",
    scope: "individual",
    features: [
      "Everything in Pro",
      "Multiple LinkedIn & Email accounts",
      "AI objection handling & follow-ups",
      "AI newsletter generation & broadcast",
      "Priority execution runner",
      "Priority email support",
    ],
    cta: "Upgrade to Power",
  },
];

export const ORGANIZATION_PLANS: PricingPlan[] = [
  {
    id: "org_starter",
    name: "Team Starter",
    price: "$99",
    priceSuffix: "/mo",
    tagline: "Collaborative workspace for up to 5 team members.",
    scope: "org",
    features: [
      "Up to 5 team members included",
      "Shared organization workspace in Settings",
      "Team invite code for instant onboarding",
      "Shared lead lists & company database",
      "Admin & Member role management",
      "AI writing & CRM for every teammate",
    ],
    cta: "Get Team Starter",
  },
  {
    id: "org_scale",
    name: "Team Scale",
    price: "$199",
    priceSuffix: "/mo",
    tagline: "High-volume outreach & AI workflows for growing teams.",
    scope: "org",
    highlighted: true,
    features: [
      "Up to 15 team members included",
      "All AI writing & intent classification features",
      "Centralized organization management in Settings",
      "Shared CRM pipeline & deal tracking",
      "Centralized sending limits & rate controls",
      "Multi-account sending pools",
    ],
    cta: "Get Team Scale",
  },
  {
    id: "org_enterprise",
    name: "Enterprise",
    price: "$399",
    priceSuffix: "/mo",
    tagline: "Unlimited team seats, custom limits & dedicated support.",
    scope: "org",
    features: [
      "Unlimited team members",
      "Custom sending limits & queue priorities",
      "Organization invite code with auto-join",
      "Full admin & member role hierarchy",
      "Team activity logs & audit tracking",
      "SLA & 24/7 dedicated support",
    ],
    cta: "Get Enterprise",
  },
];

export const PRICING_PLANS = [...INDIVIDUAL_PLANS, ...ORGANIZATION_PLANS];

/** Feature blurbs shown on paywall lock overlays around specific AI actions in the app. */
export const AI_FEATURE_COPY = {
  beautify: "AI email formatting is a paid feature.",
  newsletterGenerate: "AI newsletter generation is a paid feature.",
  linkedinClassify: "AI reply classification is a paid feature.",
  agentPreview: "AI-personalized campaign copy is a paid feature.",
  pipeline: "The CRM deal pipeline is a paid feature.",
};
