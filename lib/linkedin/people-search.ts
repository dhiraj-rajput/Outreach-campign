/**
 * Classic LinkedIn people search (keywords → people results).
 *
 * Design (aligned with session.ts / scraper.ts / sync-accepted.ts):
 *  - Reuses getSessionPage() — one serialized page queue, real stored session
 *  - Prefer network intercept of Voyager/GraphQL search payloads when present
 *  - Fallback: DOM parse of people result cards (selectors are intentionally broad)
 *  - Human-like delays + hard page caps to keep account behaviour sane
 *  - Structured console logging so failures are diagnosable in server logs
 *
 * Not a public LinkedIn API. Requires an authenticated account cookie jar.
 * LinkedIn may challenge, rate-limit, or change response shapes — callers must
 * surface errors to the UI and never retry aggressively.
 */

import type { Page, Response } from "playwright";
import { getSessionPage, saveSessionState, markNeedsReauth } from "@/lib/linkedin/session";
import { normalizeLinkedInProfileUrl, vanityFromLinkedInUrl } from "@/lib/linkedin/url";

export interface PeopleSearchHit {
  linkedinUrl: string;
  vanityName: string | null;
  fullName: string | null;
  headline: string | null;
  location: string | null;
  degree: number | null;
  profileImageUrl: string | null;
}

export interface PeopleSearchResult {
  keywords: string;
  page: number;
  hits: PeopleSearchHit[];
  /** Best-effort total from UI / API when available */
  totalEstimated: number | null;
  source: "network" | "dom" | "mixed";
  searchUrl: string;
  warnings: string[];
  durationMs: number;
}

export interface PeopleSearchOptions {
  /** 1-based page index (LinkedIn people SERP uses page=) */
  page?: number;
  /** Max results to return from this page (LinkedIn typically shows ~10) */
  limit?: number;
  /** Extra wait after navigation before parsing (ms) */
  settleMs?: number;
}

const LOG = (msg: string) => {
  console.log(`[people-search] ${msg}`);
};

function encodeKeywords(keywords: string): string {
  return encodeURIComponent(keywords.trim().replace(/\s+/g, " "));
}

export function buildPeopleSearchUrl(keywords: string, page = 1): string {
  const kw = encodeKeywords(keywords);
  const pageParam = page > 1 ? `&page=${page}` : "";
  // origin=CLUSTER_EXPANSION matches LinkedIn's "See all people results" path
  return `https://www.linkedin.com/search/results/people/?keywords=${kw}&origin=CLUSTER_EXPANSION${pageParam}`;
}

function normalizeProfileUrl(href: string | null | undefined): string | null {
  return normalizeLinkedInProfileUrl(href);
}

function vanityFromUrl(url: string | null): string | null {
  return vanityFromLinkedInUrl(url);
}

function parseDegree(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/([123])(?:st|nd|rd)?\s*(?:degree)?/i);
  if (m) return Number(m[1]);
  if (/connected/i.test(text)) return 1;
  return null;
}

/** Pull people-like entities from Voyager/GraphQL JSON blobs (shape drifts). */
function extractHitsFromJson(payload: unknown, into: Map<string, PeopleSearchHit>): void {
  if (!payload || typeof payload !== "object") return;

  const visit = (node: unknown, depth: number) => {
    if (!node || depth > 12) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;

    // Profile-ish objects
    const publicId =
      (typeof o.publicIdentifier === "string" && o.publicIdentifier) ||
      (typeof o.vanityName === "string" && o.vanityName) ||
      null;

    let linkedinUrl: string | null = null;
    if (publicId && !String(publicId).startsWith("ACo")) {
      linkedinUrl = `https://www.linkedin.com/in/${publicId}`;
    }
    if (!linkedinUrl && typeof o.navigationUrl === "string") {
      linkedinUrl = normalizeProfileUrl(o.navigationUrl);
    }
    if (!linkedinUrl && typeof o.url === "string") {
      linkedinUrl = normalizeProfileUrl(o.url);
    }

    const first = typeof o.firstName === "string" ? o.firstName : null;
    const last = typeof o.lastName === "string" ? o.lastName : null;
    const fullFromParts = [first, last].filter(Boolean).join(" ") || null;
    const fullName =
      (typeof o.fullName === "string" && o.fullName) ||
      (typeof o.title === "object" &&
        o.title &&
        typeof (o.title as { text?: string }).text === "string" &&
        (o.title as { text: string }).text) ||
      fullFromParts;

    const headline =
      (typeof o.headline === "string" && o.headline) ||
      (typeof o.primarySubtitle === "object" &&
        o.primarySubtitle &&
        typeof (o.primarySubtitle as { text?: string }).text === "string" &&
        (o.primarySubtitle as { text: string }).text) ||
      null;

    const location =
      (typeof o.geoLocationName === "string" && o.geoLocationName) ||
      (typeof o.secondarySubtitle === "object" &&
        o.secondarySubtitle &&
        typeof (o.secondarySubtitle as { text?: string }).text === "string" &&
        (o.secondarySubtitle as { text: string }).text) ||
      null;

    if (linkedinUrl && (fullName || publicId)) {
      const key = linkedinUrl.toLowerCase();
      if (!into.has(key)) {
        into.set(key, {
          linkedinUrl,
          vanityName: vanityFromUrl(linkedinUrl),
          fullName: fullName ?? publicId,
          headline,
          location,
          degree: typeof o.memberDistance === "string" ? parseDegree(o.memberDistance) : null,
          profileImageUrl: null,
        });
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1);
    }
  };

  visit(payload, 0);
}

async function extractHitsFromDom(page: Page): Promise<PeopleSearchHit[]> {
  return page.evaluate(() => {
    const results: Array<{
      linkedinUrl: string;
      vanityName: string | null;
      fullName: string | null;
      headline: string | null;
      location: string | null;
      degree: number | null;
      profileImageUrl: string | null;
    }> = [];

    const seen = new Set<string>();

    const push = (href: string, root: Element) => {
      try {
        const u = new URL(href, location.origin);
        const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
        if (!m) return;
        const vanity = decodeURIComponent(m[1]).replace(/\/+$/, "");
        const linkedinUrl = `https://www.linkedin.com/in/${vanity}`;
        const key = linkedinUrl.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const nameEl =
          root.querySelector(
            ".entity-result__title-text a span[aria-hidden='true'], .entity-result__title-text a span:not(.visually-hidden), a.app-aware-link span[aria-hidden='true'], .linked-area span[aria-hidden='true']"
          ) || root.querySelector("span[aria-hidden='true']");
        const fullName = nameEl?.textContent?.trim() || vanity;

        const headlineEl = root.querySelector(
          ".entity-result__primary-subtitle, .entity-result__summary, .t-14.t-black.t-normal"
        );
        const locationEl = root.querySelector(
          ".entity-result__secondary-subtitle, .entity-result__simple-insight"
        );
        const degreeEl = root.querySelector(
          ".entity-result__badge-text, .dist-value, span.image-text-lockup__label"
        );
        const img = root.querySelector("img") as HTMLImageElement | null;

        const degText = degreeEl?.textContent?.trim() || "";
        let degree: number | null = null;
        const dm = degText.match(/([123])/);
        if (dm) degree = Number(dm[1]);

        results.push({
          linkedinUrl,
          vanityName: vanity,
          fullName,
          headline: headlineEl?.textContent?.trim() || null,
          location: locationEl?.textContent?.trim() || null,
          degree,
          profileImageUrl: img?.src || null,
        });
      } catch {
        /* ignore bad nodes */
      }
    };

    // Prefer structured result containers, then any /in/ links in main
    const containers = document.querySelectorAll(
      "li.reusable-search__result-container, div.entity-result, li.zgFLqXXbEFtWwHNaii, div[data-chameleon-result-urn]"
    );
    if (containers.length) {
      containers.forEach((root) => {
        const a = root.querySelector(
          "a[href*='/in/']"
        ) as HTMLAnchorElement | null;
        if (a?.href) push(a.href, root);
      });
    } else {
      document.querySelectorAll("main a[href*='/in/'], .search-results-container a[href*='/in/']").forEach((a) => {
        const el = a as HTMLAnchorElement;
        const root = el.closest("li, div") || el;
        push(el.href, root);
      });
    }

    return results;
  });
}

async function readEstimatedTotal(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    // "1,234 results" / "About 100 results"
    const m = text.match(/(?:About\s+)?([\d,]+)\s+results?/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  });
}

/**
 * Run one page of people search for keywords using the account's live session.
 */
export async function searchPeople(
  accountId: string,
  keywords: string,
  opts: PeopleSearchOptions = {}
): Promise<PeopleSearchResult> {
  const started = Date.now();
  const pageNum = Math.max(1, Math.min(50, opts.page ?? 1));
  const limit = Math.max(1, Math.min(50, opts.limit ?? 25));
  const settleMs = opts.settleMs ?? 2500 + Math.floor(Math.random() * 1500);
  const trimmed = keywords.trim().replace(/\s+/g, " ");
  const warnings: string[] = [];

  if (!trimmed || trimmed.length < 2) {
    throw new Error("Keywords must be at least 2 characters.");
  }
  if (trimmed.length > 200) {
    throw new Error("Keywords are too long (max 200 characters).");
  }

  const searchUrl = buildPeopleSearchUrl(trimmed, pageNum);
  LOG(`start account=${accountId} keywords="${trimmed}" page=${pageNum}`);

  const page = await getSessionPage(accountId);
  const networkHits = new Map<string, PeopleSearchHit>();
  let networkHitsCount = 0;

  const onResponse = async (response: Response) => {
    try {
      const url = response.url();
      if (response.status() !== 200) return;
      if (!url.includes("linkedin.com")) return;
      // Voyager search / graphql people clusters
      // Ignore chrome/nav GraphQL (feeds noise like voyagerFeedDashGlobalNavs)
      if (url.includes("voyagerFeedDash") || url.includes("GlobalNavs") || url.includes("voyagerIdentityDash")) {
        return;
      }
      const interesting =
        url.includes("voyagerSearchDashClusters") ||
        url.includes("searchDashClusters") ||
        url.includes("/voyager/api/search") ||
        (url.includes("/voyager/api/graphql") &&
          (url.includes("Search") || url.includes("search") || url.includes("Cluster")));
      if (!interesting) return;

      const ct = (response.headers()["content-type"] || "").toLowerCase();
      if (!ct.includes("json") && !ct.includes("javascript")) return;

      const json = await response.json().catch(() => null);
      if (!json) return;
      const before = networkHits.size;
      extractHitsFromJson(json, networkHits);
      if (networkHits.size > before) {
        networkHitsCount = networkHits.size;
        LOG(`network hit absorbed total=${networkHits.size}`);
      }
    } catch {
      /* ignore non-json */
    }
  };

  page.on("response", onResponse);

  try {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    LOG(`navigated ${page.url()}`);

    // Auth wall / challenge detection
    const current = page.url();
    if (/\/login|\/authwall|\/checkpoint|\/uas\/|\/challenge/i.test(current)) {
      LOG(`auth wall detected ${current}`);
      try {
        await markNeedsReauth(accountId);
      } catch {
        /* ignore */
      }
      throw new Error(
        "LinkedIn session needs re-authentication (login/checkpoint). Re-authenticate the account in Settings."
      );
    }

    // Allow XHRs to settle; small human-like pause
    await page.waitForTimeout(settleMs);

    // Nudge scroll so lazy result modules load
    await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
    await page.waitForTimeout(800 + Math.floor(Math.random() * 700));
    await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
    await page.waitForTimeout(500 + Math.floor(Math.random() * 500));

    const totalEstimated = await readEstimatedTotal(page);
    const domHits = await extractHitsFromDom(page);
    LOG(`dom extract count=${domHits.length} totalEstimated=${totalEstimated ?? "n/a"}`);

    // Merge network + DOM (DOM often has cleaner headline/location)
    const merged = new Map<string, PeopleSearchHit>();
    for (const h of networkHits.values()) {
      merged.set(h.linkedinUrl.toLowerCase(), h);
    }
    for (const h of domHits) {
      const key = h.linkedinUrl.toLowerCase();
      const prev = merged.get(key);
      if (!prev) merged.set(key, h);
      else {
        merged.set(key, {
          linkedinUrl: h.linkedinUrl,
          vanityName: h.vanityName || prev.vanityName,
          fullName: h.fullName || prev.fullName,
          headline: h.headline || prev.headline,
          location: h.location || prev.location,
          degree: h.degree ?? prev.degree,
          profileImageUrl: h.profileImageUrl || prev.profileImageUrl,
        });
      }
    }

    let source: PeopleSearchResult["source"] = "dom";
    if (networkHitsCount > 0 && domHits.length > 0) source = "mixed";
    else if (networkHitsCount > 0) source = "network";

    const hits = Array.from(merged.values()).slice(0, limit);

    if (hits.length === 0) {
      warnings.push(
        "No people results found. Keywords may be too narrow, LinkedIn may have changed the layout, or the account may be restricted."
      );
      // Capture a short diagnostic
      const title = await page.title().catch(() => "");
      LOG(`zero results title="${title}" url=${page.url()} networkHits=${networkHitsCount}`);
    }

    LOG(`done hits=${hits.length} source=${source} totalEstimated=${totalEstimated ?? "n/a"} durationMs=${Date.now() - started}`);

    return {
      keywords: trimmed,
      page: pageNum,
      hits,
      totalEstimated,
      source,
      searchUrl,
      warnings,
      durationMs: Date.now() - started,
    };
  } finally {
    page.off("response", onResponse);
    let url = "";
    try {
      url = page.url();
    } catch {
      /* gone */
    }
    try {
      await page.close();
    } catch {
      /* ignore */
    }
    if (/\/login|\/authwall|\/checkpoint|\/uas\//.test(url)) {
      LOG(`ending on wall — flag reauth ${url}`);
      try {
        await markNeedsReauth(accountId);
      } catch {
        /* ignore */
      }
    } else {
      try {
        await saveSessionState(accountId);
      } catch (e) {
        LOG(`saveSessionState failed ${String(e)}`);
      }
    }
  }
}
