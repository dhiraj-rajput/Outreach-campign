import type { Page } from "playwright";

export class WeeklyLimitError extends Error {}
export class AlreadyConnectedError extends Error {}
export class PendingInviteError extends Error {}
export class NoteLimitError extends Error {}

/** LinkedIn hard-caps invitation notes at 300 characters. */
export const LINKEDIN_NOTE_MAX_CHARS = 300;

/**
 * Sends a LinkedIn connection request, optionally with a personalized note.
 *
 * When `note` is provided and non-empty, follows the modern invite flow:
 *   1. Trigger Connect (direct CTA or More menu)
 *   2. Handle the 2026 "Add a note to your invitation?" gating dialog if present
 *   3. Click "Add a note", fill the textarea, click Send
 *
 * When `note` is empty/undefined, sends without a note (previous behaviour).
 *
 * Throws WeeklyLimitError if the weekly limit popup appears.
 * Throws AlreadyConnectedError / PendingInviteError if already in that state.
 * Throws NoteLimitError if LinkedIn refuses the note (monthly personalised-note quota).
 */
export async function sendConnectionRequest(
  page: Page,
  linkedinUrl: string,
  note?: string | null
): Promise<void> {
  const trimmedNote = (note ?? "").trim().slice(0, LINKEDIN_NOTE_MAX_CHARS);
  const useNote = trimmedNote.length > 0;

  await page.goto(linkedinUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000 + Math.random() * 1000);

  // Already connected? Primary signal: presence of the profile's "Message" link
  // (only shown to 1st-degree connections) — an href attribute, not a CSS class
  // or translated text, so it survives LinkedIn's class-name hashing and non-
  // English UI languages. Falls back to the old text-scrape for accounts/layouts
  // where that link isn't found as a plain <a href>.
  //
  // MUST be scoped to the visited person's own intro/top card — a page-wide
  // search also matches "Message" links / "1st" badges belonging to OTHER
  // people rendered elsewhere on the page (sidebar modules like "People also
  // viewed"). For a non-connected target this false-positived AlreadyConnected,
  // which skipped the real invite AND (via the message step that follows) sent
  // a message to a random unrelated 1st-degree connection instead of the
  // target — see CLAUDE.md / memory for the Jul 2026 incident. The top card is
  // identified structurally as the section containing the page's own <h1> name
  // heading, robust to class-name hashing. Mirrors the same fix in visit.ts.
  const topCard = page.locator("main section").filter({ has: page.locator("h1") }).first();
  const hasMessageLink = await topCard.locator('a[href*="/messaging/compose"]').first().count() > 0;
  if (hasMessageLink) throw new AlreadyConnectedError("Already connected");
  const pageText = await topCard.innerText().catch(() => "");
  if (/\b1st\b/.test(pageText)) throw new AlreadyConnectedError("Already connected");

  // Pending?
  if (/\bPending\b/.test(pageText)) throw new PendingInviteError("Invitation already pending");
  const pendingBtn = page.locator('button[aria-label*="Pending"]:visible');
  if (await pendingBtn.count() > 0) throw new PendingInviteError("Invitation already pending");

  // Case 1: Direct Connect link (primary CTA) — navigate to its href directly.
  // Clicking fails because the Sales Nav overlay SVG intercepts pointer events.
  const directConnect = page
    .locator('a[aria-label*="Invite"][aria-label*="to connect"]:visible, a[href*="custom-invite"]:visible')
    .first();
  if (await directConnect.count() > 0) {
    const href = await directConnect.getAttribute("href");
    if (!href) throw new Error("Connect link has no href");
    const inviteUrl = href.startsWith("http") ? href : `https://www.linkedin.com${href}`;
    await page.goto(inviteUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000 + Math.random() * 500);
  } else {
    // Case 2: Connect is inside the "..." More menu
    // LinkedIn has two "More" buttons on page: [0] = nav bar, [1] = profile card
    const moreBtn = page.locator('button[aria-label="More"]:visible').nth(1);
    await moreBtn.click();
    await page.waitForTimeout(800);

    // Check for Pending in the menu — means invite was already sent
    const pendingMenuItem = page.locator('[role="menuitem"]:has-text("Pending"):visible');
    if (await pendingMenuItem.count() > 0) {
      throw new PendingInviteError("Invitation already pending (found in More menu)");
    }

    const connectOption = page.locator('[role="menuitem"]:has-text("Connect"):visible');
    if (await connectOption.count() === 0) throw new Error("Connect option not found in More menu");
    await connectOption.first().click();
  }

  await page.waitForTimeout(1000 + Math.random() * 500);

  if (useNote) {
    await sendWithNote(page, trimmedNote);
  } else {
    await sendWithoutNote(page);
  }

  // Check for weekly limit popup
  const limitPopup = page.locator('div[class*="ip-fuse-limit-alert__warning"]');
  if (await limitPopup.count() > 0) throw new WeeklyLimitError("Weekly connection limit reached");

  // Check for error toast (includes monthly personalised-note quota exhaustion)
  const errorToast = page.locator('div[data-test-artdeco-toast-item-type="error"]:visible');
  if (await errorToast.count() > 0) {
    const msg = (await errorToast.innerText()).trim();
    if (/note|personaliz|invitation limit|monthly/i.test(msg)) {
      throw new NoteLimitError(`Connection note rejected by LinkedIn: ${msg}`);
    }
    throw new Error(`Connection error: ${msg}`);
  }
}

/** Click "Send without a note" / "Send now" on the invite dialog. */
async function sendWithoutNote(page: Page): Promise<void> {
  const sendBtn = page.locator(
    'button:has-text("Send without a note"), button[aria-label*="Send without"], button:has-text("Send now"), button[aria-label*="Send invitation"]:not([aria-label*="note"])'
  );
  if (await sendBtn.count() > 0) {
    await sendBtn.first().click({ force: true });
    await page.waitForTimeout(1500);
  }
}

/**
 * Full note path — handles both the legacy 3-button dialog and the 2026
 * two-button gating dialog ("Add a note to your invitation?").
 * Selectors drawn from multiple open-source Playwright/Puppeteer bots that
 * remain current as of mid-2026.
 */
async function sendWithNote(page: Page, note: string): Promise<void> {
  // 1. If the gating dialog is present ("Add a note?" / "Send without a note"),
  //    click "Add a note" so the textarea is mounted.
  const addNoteGate = page.locator(
    'button:has-text("Add a note"), button[aria-label*="Add a note"]'
  ).first();
  if (await addNoteGate.count() > 0) {
    await addNoteGate.click({ force: true });
    await page.waitForTimeout(600 + Math.random() * 400);
  }

  // 2. Locate the custom-message textarea. LinkedIn has used several IDs/names
  //    over time; cover the common ones.
  const noteBox = page
    .locator(
      'textarea#custom-message, textarea[name="message"], textarea[id*="custom-message"], textarea[placeholder*="note" i], div[role="dialog"] textarea'
    )
    .first();

  try {
    await noteBox.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    // Textarea never appeared — fall back to send-without-note so the invite
    // still goes out rather than failing the whole step.
    console.warn("[connect] Note textarea not found after Add a note — falling back to send without note");
    await sendWithoutNote(page);
    return;
  }

  await noteBox.click();
  await page.waitForTimeout(200);

  // Clear any pre-filled content then type / paste the note human-like.
  await noteBox.fill("");
  try {
    await page.evaluate((t) => navigator.clipboard.writeText(t), note);
    await page.waitForTimeout(150);
    await noteBox.press("Control+V");
  } catch {
    // Clipboard may be blocked in some environments
    await noteBox.pressSequentially(note, { delay: 25 + Math.random() * 30 });
  }
  await page.waitForTimeout(400 + Math.random() * 300);

  // 3. Click the primary Send button on the note dialog.
  const sendWithNoteBtn = page
    .locator(
      'button[aria-label*="Send invitation"], button:has-text("Send"):not(:has-text("without")), button[aria-label="Send now"]'
    )
    .filter({ hasNotText: /without/i })
    .first();

  if (await sendWithNoteBtn.count() > 0) {
    await sendWithNoteBtn.click({ force: true });
  } else {
    // Last-resort: any visible primary button inside the dialog
    const dialogSend = page.locator('div[role="dialog"] button.artdeco-button--primary:visible').first();
    if (await dialogSend.count() > 0) {
      await dialogSend.click({ force: true });
    } else {
      throw new Error("Could not find Send button after filling connection note");
    }
  }
  await page.waitForTimeout(1500 + Math.random() * 500);
}
