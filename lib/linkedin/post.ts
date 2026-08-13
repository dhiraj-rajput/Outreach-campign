/**
 * LinkedIn post creation via Playwright — personal feed composer.
 *
 * Anti-detection practices (aligned with 2025–2026 research):
 * - Reuses the account's existing authenticated session (same fingerprint as outreach)
 * - Multiple selector fallbacks (LinkedIn changes class names often)
 * - Human-like delays (gaussian-ish random ranges, not fixed intervals)
 * - Short text: character typing with variable delay; long text: clipboard paste
 * - Media via setInputFiles on hidden input + "Next" on media editor when shown
 * - Only posts when Post button is enabled; confirms modal closed
 * - Respects runner active-hours (caller responsibility)
 */
import type { Page } from "playwright";
import path from "path";
import fs from "fs";

export interface MediaItem {
  path: string;
  type: "image" | "video" | "document";
  name?: string;
}

export interface PollData {
  question: string;
  options: string[];
  durationDays?: 1 | 3 | 7 | 14;
}

export interface CreatePostOptions {
  content: string;
  visibility?: "anyone" | "connections";
  commentControl?: "anyone" | "connections" | "none";
  brandPartnership?: boolean;
  media?: MediaItem[];
  poll?: PollData;
  scheduleAt?: string | null;
  forceImmediate?: boolean;
}

export interface CreatePostResult {
  success: boolean;
  postUrn?: string | null;
  error?: string;
  usedNativeSchedule?: boolean;
}

const FEED_URL = "https://www.linkedin.com/feed/";
/** Direct composer entry used by profile "Create a post" (hover shows this href). */
const SHAREBOX_URL = "https://www.linkedin.com/preload/sharebox/";
/** Alternate feed entry that forces the share box open. */
const FEED_SHARE_ACTIVE_URL = "https://www.linkedin.com/feed/?shareActive=true";

async function humanDelay(minMs = 400, maxMs = 1400) {
  const t = minMs + Math.random() * (maxMs - minMs);
  const extra = Math.random() < 0.12 ? 400 + Math.random() * 900 : 0;
  await new Promise((r) => setTimeout(r, t + extra));
}

async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (
    url.includes("/login") ||
    url.includes("/uas/") ||
    url.includes("/checkpoint/") ||
    url.includes("/authwall") ||
    url.includes("/signup")
  ) {
    return false;
  }

  // Give the feed a moment to hydrate after navigation (cookies restore can lag)
  for (let attempt = 0; attempt < 3; attempt++) {
    const nav = page
      .locator(
        'nav.global-nav, #global-nav, [data-test-global-nav], header.global-nav, ' +
          '[data-test-id="nav"], .global-nav__me, button[aria-label*="Me" i], ' +
          'img.global-nav__me-photo, .feed-identity-module'
      )
      .first();
    if (await nav.isVisible({ timeout: 3500 }).catch(() => false)) return true;

    const start = page
      .locator(
        'button.share-box-feed-entry__trigger, button[aria-label*="Start a post" i], ' +
          'div.share-box-feed-entry__trigger, div.share-box-feed-entry__closed-share-box, ' +
          '[data-control-name="share.sharebox_focus"]'
      )
      .first();
    if (await start.isVisible({ timeout: 2500 }).catch(() => false)) return true;

    // Profile / messaging indicators that only appear when authenticated
    const profileHint = page
      .locator(
        'a[href*="/in/"][href*="miniProfile"], a[data-control-name="identity_welcome_message"], ' +
          '.feed-identity-module__actor-meta, .profile-rail-card'
      )
      .first();
    if (await profileHint.isVisible({ timeout: 1500 }).catch(() => false)) return true;

    if (attempt < 2) await humanDelay(800, 1400);
  }
  return false;
}

async function editorVisible(page: Page): Promise<boolean> {
  const editor = page.locator(
    'div.ql-editor[contenteditable="true"], ' +
      'div.share-creation-state__text-editor div[contenteditable="true"], ' +
      'div[role="textbox"][contenteditable="true"], ' +
      'div[data-placeholder*="talk about" i][contenteditable="true"], ' +
      'div[aria-placeholder*="talk about" i][contenteditable="true"]'
  ).first();
  return editor.isVisible({ timeout: 8000 }).catch(() => false);
}

function editorLocator(page: Page) {
  return page.locator(
    'div.ql-editor[contenteditable="true"], ' +
      'div.share-creation-state__text-editor div[contenteditable="true"], ' +
      'div[role="textbox"][contenteditable="true"], ' +
      'div[data-placeholder*="talk about" i][contenteditable="true"], ' +
      'div[aria-placeholder*="talk about" i][contenteditable="true"]'
  ).first();
}

async function dismissOverlays(page: Page) {
  for (const sel of [
    'button[action-type="ACCEPT"]',
    'button:has-text("Accept")',
    'button:has-text("Dismiss")',
    'button[aria-label="Dismiss"]',
    'button[aria-label="Close"]',
    'button.artdeco-modal__dismiss',
  ]) {
    const b = page.locator(sel).first();
    if (await b.isVisible({ timeout: 500 }).catch(() => false)) {
      await b.click().catch(() => {});
      await humanDelay(250, 500);
    }
  }
}

async function assertLoggedIn(page: Page) {
  if (await isLoggedIn(page)) return;
  const url = page.url();
  if (
    url.includes("/login") ||
    url.includes("/uas/") ||
    url.includes("/checkpoint/") ||
    url.includes("/authwall")
  ) {
    throw new Error(
      "LinkedIn session not authenticated — re-login the account in Linki (redirected to " +
        url.split("?")[0] +
        ")"
    );
  }
  throw new Error("LinkedIn session not authenticated — re-login the account in Linki");
}

async function tryClickStartPost(page: Page): Promise<boolean> {
  const startSelectors = [
    'button.share-box-feed-entry__trigger',
    'button[aria-label*="Start a post" i]',
    'button[aria-label*="Create a post" i]',
    'a[href*="/preload/sharebox"]',
    'a[href*="sharebox"]',
    'div.share-box-feed-entry__trigger',
    'div.share-box-feed-entry__closed-share-box',
    'button.artdeco-button:has-text("Start a post")',
    'button.artdeco-button:has-text("Create a post")',
    'div[role="button"]:has-text("Start a post")',
    'div[role="button"]:has-text("Create a post")',
    '[data-control-name="share.sharebox_focus"]',
    'button.share-box-feed-entry__trigger--v2',
    'button:has-text("Start a post")',
    'button:has-text("Create a post")',
  ];

  for (const sel of startSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await humanDelay(200, 450);
        await el.click({ timeout: 5000 });
        await humanDelay(700, 1300);
        if (await editorVisible(page)) return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

async function openComposer(page: Page): Promise<boolean> {
  // 1) Land on feed so restored cookies apply and auth redirects are visible
  try {
    await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    console.warn("[post] feed navigation failed:", e instanceof Error ? e.message : e);
  }
  await humanDelay(1500, 2800);
  await dismissOverlays(page);
  await assertLoggedIn(page);

  // 2) Try native feed / profile-style "Start a post" / "Create a post" clicks
  if (await tryClickStartPost(page)) return true;

  // 3) Direct sharebox URL (the href behind profile Activity → "Create a post")
  try {
    await page.goto(SHAREBOX_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(1200, 2200);
    await dismissOverlays(page);
    if (await editorVisible(page)) return true;
    // Sometimes sharebox lands on a shell that still needs a click
    if (await tryClickStartPost(page)) return true;
  } catch (e) {
    console.warn("[post] sharebox navigation failed:", e instanceof Error ? e.message : e);
  }

  // 4) Feed with shareActive=true (another known way to force the composer)
  try {
    await page.goto(FEED_SHARE_ACTIVE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(1500, 2500);
    await dismissOverlays(page);
    if (await editorVisible(page)) return true;
    if (await tryClickStartPost(page)) return true;
  } catch (e) {
    console.warn("[post] feed shareActive navigation failed:", e instanceof Error ? e.message : e);
  }

  // 5) Last chance: plain feed reload + click
  await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await humanDelay(1800, 3000);
  await dismissOverlays(page);
  if (await tryClickStartPost(page)) return true;

  return false;
}

async function setVisibility(page: Page, visibility: "anyone" | "connections") {
  try {
    const visTriggers = [
      'button.share-creation-state__visibility-dropdown',
      'button[aria-label*="visibility" i]',
      'button[aria-label*="Who can see" i]',
      'button:has-text("Anyone")',
      'button:has-text("Connections only")',
      'div.share-creation-state__audience-selector button',
      'button.share-creation-state__audience-button',
    ];
    let opened = false;
    for (const sel of visTriggers) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await humanDelay(400, 800);
        opened = true;
        break;
      }
    }
    if (!opened) return;

    const optionLabel = visibility === "anyone" ? "Anyone" : "Connections only";
    const option = page
      .locator(
        `label:has-text("${optionLabel}"), button:has-text("${optionLabel}"), ` +
          `div[role="radio"]:has-text("${optionLabel}"), div[role="option"]:has-text("${optionLabel}"), ` +
          `li:has-text("${optionLabel}")`
      )
      .first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      await humanDelay(300, 600);
      const done = page.locator('button:has-text("Done"), button:has-text("Save")').first();
      if (await done.isVisible({ timeout: 1500 }).catch(() => false)) {
        await done.click();
        await humanDelay(300, 500);
      }
    }
  } catch (e) {
    console.warn("[post] visibility set failed:", e instanceof Error ? e.message : e);
  }
}

async function fillContent(page: Page, content: string) {
  const editor = editorLocator(page);
  await editor.click({ timeout: 5000 });
  await humanDelay(250, 500);

  await page.keyboard.press("Control+A");
  await humanDelay(80, 150);
  await page.keyboard.press("Backspace");
  await humanDelay(200, 400);

  const text = content.trim();
  if (!text) return;

  if (text.length < 180) {
    for (const ch of text) {
      await page.keyboard.type(ch, { delay: 0 });
      await new Promise((r) => setTimeout(r, 35 + Math.random() * 70));
      if (Math.random() < 0.04) await humanDelay(120, 280);
    }
  } else {
    await page.evaluate(async (t) => {
      await navigator.clipboard.writeText(t);
    }, text);
    await humanDelay(150, 350);
    await page.keyboard.press("Control+V");
  }
  await humanDelay(500, 1000);

  await editor.evaluate((el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }).catch(() => {});
}

function resolveMediaPath(p: string): string {
  if (path.isAbsolute(p) && fs.existsSync(p)) return p;
  const candidates = [
    path.join(process.cwd(), p.replace(/^\//, "")),
    path.join(process.cwd(), "public", p.replace(/^\/?uploads\//, "uploads/")),
    path.join(process.cwd(), p.replace(/^public\//, "")),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Media file not found: ${p}`);
}

async function attachMedia(page: Page, media: MediaItem[]) {
  if (!media.length) return;

  const paths = media.map((m) => resolveMediaPath(m.path));
  const isDocument = media.some((m) => m.type === "document");

  let input = page.locator('input[type="file"]').first();
  if ((await input.count()) === 0 || !(await input.isVisible().catch(() => false))) {
    // Prefer the correct toolbar button so LinkedIn opens the right accept filter
    const mediaBtns = isDocument
      ? [
          'button[aria-label*="Add a document" i]',
          'button[aria-label*="document" i]',
          'button:has-text("Add a document")',
          'button[aria-label*="Add a photo" i]',
          'button[aria-label*="Add media" i]',
          'button.share-creation-state__media-button',
        ]
      : [
          'button[aria-label*="Add a photo" i]',
          'button[aria-label*="Add media" i]',
          'button[aria-label*="photo" i]',
          'button:has-text("Add media")',
          'button.share-creation-state__media-button',
        ];
    for (const sel of mediaBtns) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await humanDelay(600, 1200);
        break;
      }
    }
    input = page.locator('input[type="file"]').first();
  }

  if ((await input.count()) === 0) {
    throw new Error("Could not find media file input in composer");
  }

  await input.setInputFiles(paths);
  await humanDelay(1800, 3200);

  // Document uploads often show a title field + Next/Done; image/video may show crop UI
  for (const label of ["Next", "Done", "Add", "Done"]) {
    const next = page.locator(`button:has-text("${label}")`).first();
    if (await next.isVisible({ timeout: 2500 }).catch(() => false)) {
      const disabled = await next.isDisabled().catch(() => false);
      if (!disabled) {
        await next.click();
        await humanDelay(1000, 2000);
      }
    }
  }
  await humanDelay(800, 1500);
}

async function createPoll(page: Page, poll: PollData) {
  const pollBtn = page
    .locator(
      'button[aria-label*="Create a poll" i], button:has-text("Create a poll"), button[aria-label*="poll" i]'
    )
    .first();
  if (!(await pollBtn.isVisible({ timeout: 4000 }).catch(() => false))) {
    throw new Error("Poll button not found in composer");
  }
  await pollBtn.click();
  await humanDelay(800, 1400);

  const qInput = page
    .locator(
      'input[placeholder*="question" i], input[name*="question"], textarea[placeholder*="question" i]'
    )
    .first();
  await qInput.fill(poll.question);
  await humanDelay(300, 500);

  for (let i = 0; i < poll.options.length; i++) {
    let optInputs = page.locator('input[placeholder*="Option" i], input[name*="option"]');
    let count = await optInputs.count();
    if (i >= count) {
      const addBtn = page.locator('button:has-text("Add option"), button:has-text("Add another")').first();
      if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addBtn.click();
        await humanDelay(300, 500);
        optInputs = page.locator('input[placeholder*="Option" i], input[name*="option"]');
      }
    }
    await optInputs.nth(i).fill(poll.options[i]);
    await humanDelay(200, 400);
  }

  const done = page.locator('button:has-text("Done"), button:has-text("Add"), button:has-text("Create")').first();
  if (await done.isVisible({ timeout: 2000 }).catch(() => false)) {
    await done.click();
    await humanDelay(500, 900);
  }
}

async function tryNativeSchedule(page: Page, scheduleAt: string): Promise<boolean> {
  try {
    const scheduleBtn = page
      .locator(
        'button[aria-label*="Schedule" i], button:has-text("Schedule for later"), ' +
          'button.share-actions__schedule-btn, button:has([data-test-icon*="clock"])'
      )
      .first();
    if (!(await scheduleBtn.isVisible({ timeout: 3000 }).catch(() => false))) return false;

    await scheduleBtn.click();
    await humanDelay(600, 1000);

    const d = new Date(scheduleAt);
    const dateInput = page.locator('input[type="date"], input[placeholder*="Date" i]').first();
    const timeInput = page.locator('input[type="time"], input[placeholder*="Time" i]').first();

    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      await dateInput.fill(`${yyyy}-${mm}-${dd}`);
    }
    if (await timeInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      await timeInput.fill(`${hh}:${mi}`);
    }

    const next = page.locator('button:has-text("Next"), button:has-text("Schedule"), button:has-text("Done")').first();
    if (await next.isVisible({ timeout: 2000 }).catch(() => false)) {
      await next.click();
      await humanDelay(500, 900);
      const confirm = page.locator('button:has-text("Schedule"), button.share-actions__primary-action').first();
      if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirm.click();
        await humanDelay(1500, 2500);
        return true;
      }
    }
  } catch (e) {
    console.warn("[post] native schedule failed:", e instanceof Error ? e.message : e);
  }
  return false;
}

async function clickPost(page: Page) {
  const postBtn = page
    .locator(
      'button.share-actions__primary-action:not([disabled]), ' +
        'button.share-actions__primary-action:has-text("Post"), ' +
        'div.share-box_actions button:has-text("Post"), ' +
        'button[aria-label="Post"]:not([disabled])'
    )
    .first();

  for (let i = 0; i < 15; i++) {
    const visible = await postBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (visible) {
      const disabled =
        (await postBtn.isDisabled().catch(() => true)) ||
        (await postBtn.getAttribute("aria-disabled").catch(() => null)) === "true";
      if (!disabled) break;
    }
    await humanDelay(400, 700);
  }

  await postBtn.click({ timeout: 10000 });
  await humanDelay(2000, 3500);

  if (await editorVisible(page)) {
    await humanDelay(800, 1200);
    const again = page.locator('button.share-actions__primary-action:has-text("Post")').first();
    if (await again.isVisible({ timeout: 2000 }).catch(() => false)) {
      const dis = await again.isDisabled().catch(() => true);
      if (!dis) await again.click().catch(() => {});
      await humanDelay(2000, 3000);
    }
  }
}

export async function createLinkedInPost(
  page: Page,
  options: CreatePostOptions
): Promise<CreatePostResult> {
  try {
    const opened = await openComposer(page);
    if (!opened) {
      return { success: false, error: "Could not open LinkedIn post composer (UI changed or session issue)" };
    }

    if (options.visibility) {
      await setVisibility(page, options.visibility);
    }

    if (options.content?.trim()) {
      await fillContent(page, options.content.trim());
    }

    if (options.poll) {
      await createPoll(page, options.poll);
    } else if (options.media?.length) {
      await attachMedia(page, options.media);
    }

    const wantsSchedule =
      !options.forceImmediate &&
      options.scheduleAt &&
      new Date(options.scheduleAt).getTime() > Date.now() + 60_000;

    if (wantsSchedule) {
      const used = await tryNativeSchedule(page, options.scheduleAt!);
      if (used) {
        return { success: true, usedNativeSchedule: true, postUrn: null };
      }
    }

    await clickPost(page);

    await humanDelay(1000, 1800);
    const stillOpen = await editorVisible(page);
    if (stillOpen) {
      return {
        success: false,
        error: "Composer still open after Post click — post may not have published",
      };
    }

    return { success: true, usedNativeSchedule: false, postUrn: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[createLinkedInPost]", msg);
    return { success: false, error: msg };
  }
}
