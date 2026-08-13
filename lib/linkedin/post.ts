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
/**
 * Current LinkedIn personal post composer (Aug 2026 UI).
 * Clicking "Start a post" on the feed navigates to /sharing/compose
 * Editor placeholder: "Share your thoughts ..."
 */
const COMPOSE_URL = "https://www.linkedin.com/sharing/compose";
/** Legacy direct entry used by profile "Create a post" in some layouts. */
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
        '[aria-label="Start a post"], [aria-label*="Start a post" i], ' +
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

const EDITOR_SELECTORS = [
  // Current Aug 2026 composer: "Share your thoughts ..."
  'div[data-placeholder*="Share your thoughts" i]',
  'div[aria-placeholder*="Share your thoughts" i]',
  'div[placeholder*="Share your thoughts" i]',
  'div[data-placeholder*="Share your thoughts" i][contenteditable="true"]',
  'div[aria-placeholder*="Share your thoughts" i][contenteditable="true"]',
  'div[role="textbox"][contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'div.ql-editor',
  'div.share-creation-state__text-editor div[contenteditable="true"]',
  'div.share-creation-state__text-editor div.ql-editor',
  'div[data-placeholder*="talk about" i][contenteditable="true"]',
  'div[aria-placeholder*="talk about" i][contenteditable="true"]',
  'div[data-placeholder*="What do you want to talk about" i]',
  'div[aria-placeholder*="What do you want to talk about" i]',
  '.share-box div[contenteditable="true"]',
  '[data-test-id="share-box"] div[contenteditable="true"]',
  // Any contenteditable in a dialog/modal that looks like the composer
  'div[role="dialog"] div[contenteditable="true"]',
  'div.artdeco-modal div[contenteditable="true"]',
].join(", ");

async function editorVisible(page: Page): Promise<boolean> {
  const editor = page.locator(EDITOR_SELECTORS).first();
  return editor.isVisible({ timeout: 10000 }).catch(() => false);
}

function editorLocator(page: Page) {
  return page.locator(EDITOR_SELECTORS).first();
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
  // Aug 2026 feed control (from live DOM):
  // <div aria-label="Start a post" ...><p>Start a post</p></div>
  // Classes are hashed; aria-label + text are the stable hooks.
  const startSelectors = [
    '[aria-label="Start a post"]',
    '[aria-label*="Start a post" i]',
    'div[aria-label="Start a post"]',
    'div[aria-label*="Start a post" i]',
    'button[aria-label="Start a post"]',
    'button[aria-label*="Start a post" i]',
    // Text-based (works when aria-label missing)
    'div[role="button"]:has-text("Start a post")',
    'button:has-text("Start a post")',
    'p:has-text("Start a post")',
    'span:has-text("Start a post")',
    'a:has-text("Start a post")',
    // Compose / sharebox links
    'a[href*="/sharing/compose"]',
    'a[href*="/preload/sharebox"]',
    'a[href*="sharebox"]',
    // Legacy class names (older layouts)
    'button.share-box-feed-entry__trigger',
    '.share-box-feed-entry__closed-share-box',
    '.share-box-feed-entry__top-bar',
    '.share-box-feed-entry__trigger',
    'div.share-box-feed-entry__trigger',
    '[placeholder="Start a post"]',
    'div[data-placeholder="Start a post"]',
    'div[data-placeholder*="Start a post" i]',
    'button.artdeco-button:has-text("Start a post")',
    'button.artdeco-button:has-text("Create a post")',
    'div[role="button"]:has-text("Create a post")',
    '[aria-label*="Create a post" i]',
    'button[aria-label*="Create a post" i]',
    '[data-control-name="share.sharebox_focus"]',
    'button.share-box-feed-entry__trigger--v2',
    'button:has-text("Create a post")',
    'span:has-text("Create a post")',
  ];

  for (const sel of startSelectors) {
    try {
      const el = page.locator(sel).first();
      if (!(await el.isVisible({ timeout: 1500 }).catch(() => false))) continue;

      await el.scrollIntoViewIfNeeded().catch(() => {});
      await humanDelay(150, 350);

      // Prefer normal click; fall back to force + JS click (LinkedIn sometimes intercepts)
      try {
        await el.click({ timeout: 4000 });
      } catch {
        try {
          await el.click({ force: true, timeout: 3000 });
        } catch {
          await el.evaluate((node: HTMLElement) => node.click()).catch(() => {});
        }
      }

      await humanDelay(900, 1600);
      if (await editorVisible(page)) {
        console.log(`[post] composer opened via selector: ${sel}`);
        return true;
      }
      // Click may navigate to /sharing/compose — treat that as success if editor appears after
      if (page.url().includes("/sharing/compose")) {
        await humanDelay(800, 1400);
        if (await editorVisible(page)) {
          console.log(`[post] composer opened via nav after: ${sel}`);
          return true;
        }
      }
    } catch {
      /* next */
    }
  }

  // Last-resort: any element whose aria-label or text is exactly "Start a post"
  try {
    const clicked = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('[aria-label], button, div[role="button"], p, span, a')
      ) as HTMLElement[];
      for (const el of candidates) {
        const label = (el.getAttribute("aria-label") || "").trim();
        const text = (el.textContent || "").trim();
        if (label === "Start a post" || text === "Start a post") {
          el.scrollIntoView({ block: "center", inline: "center" });
          el.click();
          return true;
        }
      }
      return false;
    });
    if (clicked) {
      await humanDelay(1200, 2000);
      if (await editorVisible(page) || page.url().includes("/sharing/compose")) {
        console.log("[post] composer opened via JS aria-label/text scan");
        if (page.url().includes("/sharing/compose") && !(await editorVisible(page))) {
          await humanDelay(1000, 1800);
        }
        if (await editorVisible(page)) return true;
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

/** Diagnostic snapshot when composer fails — helps next fix. */
async function logComposerDiagnostics(page: Page, stage: string) {
  try {
    const info = await page.evaluate(() => {
      const textSnips = Array.from(document.querySelectorAll("button, a, div[role='button']"))
        .map((el) => (el.textContent || "").trim().slice(0, 40))
        .filter((t) => /post|share|start|create|write/i.test(t))
        .slice(0, 15);
      return {
        url: location.href,
        title: document.title,
        hasQlEditor: !!document.querySelector(".ql-editor"),
        hasContentEditable: !!document.querySelector('[contenteditable="true"]'),
        hasShareBox: !!document.querySelector(
          ".share-box-feed-entry__trigger, .share-box-feed-entry__closed-share-box, [class*='share-box']"
        ),
        bodyTextSample: (document.body?.innerText || "").slice(0, 200),
        postLikeControls: textSnips,
      };
    });
    console.warn(`[post] composer diagnostic @ ${stage}:`, JSON.stringify(info));
  } catch (e) {
    console.warn(`[post] diagnostic failed @ ${stage}:`, e instanceof Error ? e.message : e);
  }
}

async function openComposer(page: Page): Promise<boolean> {
  // 1) Auth check on feed (cookies applied, redirects visible)
  try {
    await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    console.warn("[post] feed navigation failed:", e instanceof Error ? e.message : e);
  }
  await humanDelay(2000, 3500);
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  } catch {
    /* ignore */
  }
  await dismissOverlays(page);
  await assertLoggedIn(page);

  // 2) PRIMARY (Aug 2026): direct compose URL after clicking Start a post
  //    Real UI navigates to https://www.linkedin.com/sharing/compose
  //    Editor placeholder: "Share your thoughts ..."
  try {
    await page.goto(COMPOSE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(2000, 3500);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await dismissOverlays(page);
    if (await editorVisible(page)) {
      console.log("[post] composer opened via /sharing/compose");
      return true;
    }
    // Modal may still need a moment / click into the text area
    const editor = editorLocator(page);
    if (await editor.count().catch(() => 0)) {
      await editor.click({ timeout: 3000 }).catch(() => {});
      await humanDelay(400, 800);
      if (await editorVisible(page)) {
        console.log("[post] composer focused via /sharing/compose click");
        return true;
      }
    }
  } catch (e) {
    console.warn("[post] /sharing/compose navigation failed:", e instanceof Error ? e.message : e);
  }

  // 3) Feed → click the "Start a post" pill (matches current rounded UI)
  try {
    await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(2500, 4000);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await dismissOverlays(page);
    if (await tryClickStartPost(page)) {
      // After click, LinkedIn may navigate to /sharing/compose
      await humanDelay(1500, 2500);
      if (page.url().includes("/sharing/compose") || (await editorVisible(page))) {
        console.log("[post] composer opened via feed Start a post click →", page.url());
        return true;
      }
      // Wait for navigation to compose
      try {
        await page.waitForURL("**/sharing/compose**", { timeout: 8000 });
        await humanDelay(1000, 1800);
        if (await editorVisible(page)) {
          console.log("[post] composer opened after navigate to /sharing/compose");
          return true;
        }
      } catch {
        /* no nav */
      }
    }
  } catch (e) {
    console.warn("[post] feed click path failed:", e instanceof Error ? e.message : e);
  }

  // 4) shareActive=true (still useful on some account layouts)
  try {
    await page.goto(FEED_SHARE_ACTIVE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(2000, 3500);
    await dismissOverlays(page);
    if (await editorVisible(page)) {
      console.log("[post] composer opened via shareActive=true");
      return true;
    }
    if (await tryClickStartPost(page)) return true;
  } catch (e) {
    console.warn("[post] shareActive navigation failed:", e instanceof Error ? e.message : e);
  }

  // 5) Legacy sharebox
  try {
    await page.goto(SHAREBOX_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(2000, 3200);
    await dismissOverlays(page);
    if (await editorVisible(page)) {
      console.log("[post] composer opened via /preload/sharebox/");
      return true;
    }
    if (await tryClickStartPost(page)) return true;
  } catch (e) {
    console.warn("[post] sharebox navigation failed:", e instanceof Error ? e.message : e);
  }

  await logComposerDiagnostics(page, "all-paths-failed");
  return false;
}

async function setVisibility(page: Page, visibility: "anyone" | "connections") {
  try {
    const visTriggers = [
      // Aug 2026: "Post to Anyone" pill in composer header
      'button:has-text("Post to Anyone")',
      'button:has-text("Anyone")',
      'button:has-text("Connections only")',
      'button:has-text("Post to Connections")',
      'button[aria-label*="Anyone" i]',
      'button[aria-label*="visibility" i]',
      'button[aria-label*="Who can see" i]',
      'button.share-creation-state__visibility-dropdown',
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

    const optionLabel = visibility === "anyone" ? "Anyone" : "Connections";
    // Also match "Post to Anyone" / "Post to Connections" wording
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
          'button[aria-label*="Photo" i]',
          'button[aria-label*="Add a photo" i]',
          'button[aria-label*="Add media" i]',
          'button.share-creation-state__media-button',
        ]
      : [
          // Aug 2026 toolbar: icon buttons (Photo tooltip)
          'button[aria-label="Photo"]',
          'button[aria-label*="Photo" i]',
          'button[aria-label*="Add a photo" i]',
          'button[aria-label*="Add media" i]',
          'button[aria-label*="photo" i]',
          'button:has-text("Photo")',
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
      // Aug 2026 compose modal: bottom-right "Post" button
      'button:has-text("Post"):not([disabled]), ' +
        'button.share-actions__primary-action:not([disabled]), ' +
        'button.share-actions__primary-action:has-text("Post"), ' +
        'div.share-box_actions button:has-text("Post"), ' +
        'button[aria-label="Post"]:not([disabled]), ' +
        'button[aria-label*="Post" i]:not([disabled])'
    )
    .first();

  for (let i = 0; i < 20; i++) {
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

  // Media posts can keep the modal briefly; retry Post once if still clearly open
  if (await editorVisible(page)) {
    await humanDelay(1000, 1600);
    const again = page
      .locator(
        'button:has-text("Post"):not([disabled]), button.share-actions__primary-action:has-text("Post")'
      )
      .first();
    if (await again.isVisible({ timeout: 2500 }).catch(() => false)) {
      const dis =
        (await again.isDisabled().catch(() => true)) ||
        (await again.getAttribute("aria-disabled").catch(() => null)) === "true";
      if (!dis) {
        await again.click().catch(() => {});
        await humanDelay(2500, 4000);
      }
    }
  }
}

/**
 * Decide whether the composer is gone after clicking Post.
 * Media uploads take longer; LinkedIn may leave a contenteditable briefly.
 * Treat as closed if ANY strong success signal is present.
 */
async function isComposerClosed(page: Page, hadMedia: boolean): Promise<boolean> {
  const maxWaitMs = hadMedia ? 18000 : 10000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const url = page.url();

    // Left the compose route entirely → published
    if (
      !url.includes("/sharing/compose") &&
      !url.includes("/preload/sharebox") &&
      (url.includes("/feed") || url.includes("/in/") || url.includes("/mynetwork"))
    ) {
      console.log("[post] success: navigated away from compose →", url.split("?")[0]);
      return true;
    }

    // Post button gone + no dialog = closed
    const postBtnVisible = await page
      .locator('button:has-text("Post"), button.share-actions__primary-action')
      .first()
      .isVisible({ timeout: 800 })
      .catch(() => false);
    const dialogVisible = await page
      .locator('div[role="dialog"], .artdeco-modal, [data-test-modal-id]')
      .first()
      .isVisible({ timeout: 600 })
      .catch(() => false);

    if (!postBtnVisible && !dialogVisible && !(await editorVisible(page))) {
      console.log("[post] success: post button + dialog gone");
      return true;
    }

    // Success toast / "Post successful" style feedback
    const toast = await page
      .locator(
        'text=/post (was )?(successful|shared|published)/i, ' +
          '[data-test-artdeco-toast-item-type="success"], ' +
          '.artdeco-toast-item--visible'
      )
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (toast) {
      console.log("[post] success: toast visible");
      return true;
    }

    // Still on compose but editor empty and Post disabled → often means it already sent
    if (url.includes("/sharing/compose") || url.includes("/feed")) {
      const editorEmpty = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll('[contenteditable="true"], .ql-editor')
        ) as HTMLElement[];
        if (!els.length) return true;
        return els.every((el) => !(el.innerText || "").trim());
      }).catch(() => false);
      if (editorEmpty && !postBtnVisible) {
        console.log("[post] success: editor empty and no Post button");
        return true;
      }
    }

    await humanDelay(800, 1200);
  }

  // Final soft check: if we're no longer on compose URL, count as success
  const finalUrl = page.url();
  if (!finalUrl.includes("/sharing/compose") && !finalUrl.includes("/preload/sharebox")) {
    console.log("[post] success (soft): final URL not compose →", finalUrl.split("?")[0]);
    return true;
  }

  return false;
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

    const hadMedia = !!(options.media && options.media.length);
    const closed = await isComposerClosed(page, hadMedia);
    if (!closed) {
      // LinkedIn sometimes keeps a ghost editor briefly after a successful media post.
      // One more soft pass: if Post button is gone, treat as success.
      const postStillThere = await page
        .locator('button:has-text("Post"):not([disabled])')
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (!postStillThere) {
        console.log("[post] success (soft): Post button gone after wait");
        return { success: true, usedNativeSchedule: false, postUrn: null };
      }
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
