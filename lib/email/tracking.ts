import { randomBytes, randomUUID, createHmac } from "crypto";
import { dbGet, dbRun } from "@/lib/db";
import { scoreEmailOpened, scoreLinkClicked } from "@/lib/scoring/lead-score";

// Ported from PPT-Agent's backend/app/routes/tracking.py (open pixel / click redirect) and
// app/core/tracking_helpers.py (open_pixel_tag / click_tracking_url / rewrite_links_for_tracking).
// linki has no dedicated "campaign" row — a target IS the recipient — so tracking_events links
// straight to (target_id, run_id) instead of PPT-Agent's (lead_id, campaign_id).

// 1x1 transparent PNG, same bytes PPT-Agent serves.
export const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

function newTrackingId(): string {
  return randomBytes(16).toString("hex");
}

/** HMAC-SHA256 of the IP with NEXTAUTH_SECRET as salt — never store raw IPs (GDPR). */
export function hashIp(ip: string): string {
  if (!ip) return "";
  const secret = process.env.NEXTAUTH_SECRET || "default-ip-hash-salt";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/**
 * Register a fresh open-tracking pixel for this send and return the <img> tag to embed.
 * Call once per outbound email, right before send.
 */
export async function openPixelTag(targetId: string, runId: string | null): Promise<string> {
  const trackingId = newTrackingId();
  await dbRun(
    `INSERT INTO tracking_events (id, tracking_id, event_type, target_id, run_id)
     VALUES (?, ?, 'open', ?, ?)`,
    [randomUUID(), trackingId, targetId, runId]
  );
  const url = `${baseUrl()}/api/track/open/${trackingId}.png`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:none" />`;
}

/**
 * Rewrite every absolute http(s) href in an HTML email body to redirect through the click
 * tracker, registering one tracking_events row per link. Relative links, anchors, and
 * mailto: are left untouched.
 */
export async function rewriteLinksForTracking(html: string, targetId: string, runId: string | null): Promise<string> {
  // We need to gather all replacements first because string.replace with async replacer is tricky.
  const regex = /href=["']([^"']+)["']/gi;
  let result = html;
  const matches = [...html.matchAll(regex)];
  
  for (const match of matches) {
    const url = match[1];
    if (!/^https?:\/\//i.test(url)) continue;
    const trackingId = newTrackingId();
    await dbRun(
      `INSERT INTO tracking_events (id, tracking_id, event_type, target_id, run_id, destination_url)
       VALUES (?, ?, 'click', ?, ?, ?)`,
      [randomUUID(), trackingId, targetId, runId, url]
    );
    result = result.replace(match[0], `href="${baseUrl()}/api/track/click/${trackingId}"`);
  }
  return result;
}

interface TrackingEventRow {
  id: string;
  tracking_id: string;
  event_type: "open" | "click";
  target_id: string | null;
  destination_url: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

/**
 * Record a pixel load. Idempotent-ish: first open sets opened_at + scores the lead once;
 * repeat opens just bump open_count. Must never throw — the pixel response always succeeds.
 */
export async function recordOpen(trackingId: string, userAgent: string, ip: string): Promise<void> {
  try {
    const row = await dbGet<TrackingEventRow>(
      "SELECT * FROM tracking_events WHERE tracking_id = ? AND event_type = 'open'",
      [trackingId]
    );
    if (!row) return;

    const ipHash = hashIp(ip);
    const isFirstOpen = !row.opened_at;

    await dbRun(
      "UPDATE tracking_events SET open_count = open_count + 1, user_agent = ?, ip_hash = ?, opened_at = COALESCE(opened_at, NOW()) WHERE id = ?",
      [userAgent ?? "", ipHash, row.id]
    );

    if (isFirstOpen && row.target_id) {
      await dbRun(
        "UPDATE targets SET email_opened_at = COALESCE(email_opened_at, NOW()) WHERE id = ?",
        [row.target_id]
      );
      await scoreEmailOpened(row.target_id);
    }
  } catch (err) {
    console.error("[tracking] open recording error:", err);
  }
}

/**
 * Record a link click and return the destination URL to redirect to (or null if the tracking
 * id is unknown, in which case the caller should fall back to "/").
 */
export async function recordClick(trackingId: string, userAgent: string, ip: string): Promise<string | null> {
  try {
    const row = await dbGet<TrackingEventRow>(
      "SELECT * FROM tracking_events WHERE tracking_id = ? AND event_type = 'click'",
      [trackingId]
    );
    if (!row || !row.destination_url) return null;

    const ipHash = hashIp(ip);
    const isFirstClick = !row.clicked_at;

    await dbRun(
      "UPDATE tracking_events SET click_count = click_count + 1, user_agent = ?, ip_hash = ?, clicked_at = COALESCE(clicked_at, NOW()) WHERE id = ?",
      [userAgent ?? "", ipHash, row.id]
    );

    if (isFirstClick && row.target_id) {
      await dbRun(
        "UPDATE targets SET email_clicked_at = COALESCE(email_clicked_at, NOW()) WHERE id = ?",
        [row.target_id]
      );
      await scoreLinkClicked(row.target_id);
    }

    return row.destination_url;
  } catch (err) {
    console.error("[tracking] click recording error:", err);
    return null;
  }
}
