import { dbGet, dbRun, dbAll, dbTransaction } from "@/lib/db";
import { randomUUID } from "crypto";

const PAGE_SIZE = 25;
export const DEFAULT_DAILY_CAP = 1500;

export interface ImportRow {
  id: string;
  list_id: string;
  account_id: string | null;
  sales_nav_url: string | null;
  status: string;
  phase: string | null;
  page: number;
  total_pages: number;
  count: number;
  total: number;
  imported: number;
  skipped: number;
  error: string | null;
  scheduled_for: string | null;
  start_page: number;
  cap: number | null;
  cancel_requested: number;
  batch_index: number;
  enrich: number;
  started_at: string;
  finished_at: string | null;
}

// ─── settings ────────────────────────────────────────────────────────────────

export async function getDailyImportCap(db?: any): Promise<number> {
  const row = await dbGet<{ value: string }>("SELECT value FROM app_settings WHERE `key` = 'daily_import_cap'");
  const n = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

export async function setDailyImportCap(db: any, n: number): Promise<void> {
  const v = String(Math.max(1, Math.floor(n)));
  await dbRun(
    `INSERT INTO app_settings (\`key\`, value, updated_at) VALUES ('daily_import_cap', ?, NOW())
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
    [v]
  );
}

// ─── quota ───────────────────────────────────────────────────────────────────

/** Contacts imported across ALL lists today (the global daily budget). */
export async function importedToday(db?: any): Promise<number> {
  const row = await dbGet<{ c: number }>(
    `SELECT COALESCE(SUM(imported), 0) as c FROM list_imports
     WHERE status IN ('done', 'running') AND DATE(COALESCE(finished_at, started_at)) = CURDATE()`
  );
  return Number(row?.c || 0);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysStr(base: string, days: number): string {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Queue an import for a list. Creates the first batch as 'scheduled' for today;
 * the runner's scheduler picks it up (one import at a time). Large lists are
 * split across days under the daily cap by runBatch chaining continuations.
 */
export async function startImport(
  opts: { listId: string; accountId: string; salesNavUrl: string; enrich?: boolean }
): Promise<{ importId: string }> {
  await cancelImportsForList(opts.listId); // supersede any prior import for this list
  const importId = randomUUID();
  await dbRun(
    `INSERT INTO list_imports
       (id, list_id, account_id, sales_nav_url, status, scheduled_for, start_page, batch_index, enrich, started_at)
     VALUES (?, ?, ?, ?, 'scheduled', ?, 1, 1, ?, NOW())`,
    [importId, opts.listId, opts.accountId, opts.salesNavUrl, todayStr(), opts.enrich ? 1 : 0]
  );
  return { importId };
}

export async function cancelImportsForList(listId: string): Promise<void> {
  await dbRun(
    `UPDATE list_imports
       SET cancel_requested = 1,
           status = CASE WHEN status = 'scheduled' THEN 'canceled' ELSE status END,
           finished_at = CASE WHEN status = 'scheduled' THEN NOW() ELSE finished_at END
     WHERE list_id = ? AND status IN ('scheduled', 'running')`,
    [listId]
  );
}

export async function cancelImport(importId: string): Promise<void> {
  await dbRun(
    `UPDATE list_imports
       SET cancel_requested = 1,
           status = CASE WHEN status = 'scheduled' THEN 'canceled' ELSE status END,
           finished_at = CASE WHEN status = 'scheduled' THEN NOW() ELSE finished_at END
     WHERE id = ?`,
    [importId]
  );
}

// ─── scheduler + executor ────────────────────────────────────────────────────

let importRunning = false;

/** Runner hook (called each tick): start the next due batch if none is running. */
export async function processScheduledImports(db?: any): Promise<void> {
  if (importRunning) return;
  const due = await dbGet<ImportRow>(
    `SELECT * FROM list_imports
     WHERE status = 'scheduled' AND cancel_requested = 0
       AND (scheduled_for IS NULL OR scheduled_for <= CURDATE())
     ORDER BY scheduled_for ASC, batch_index ASC LIMIT 1`
  );
  if (!due) return;

  importRunning = true;
  await dbRun("UPDATE list_imports SET status = 'running', started_at = NOW() WHERE id = ?", [due.id]);
  runBatch(due.id)
    .catch((e) => console.error("[import] batch crashed:", e))
    .finally(() => { importRunning = false; });
}

async function runBatch(importId: string): Promise<void> {
  const job = await dbGet<ImportRow>("SELECT * FROM list_imports WHERE id = ?", [importId]);
  if (!job || !job.account_id || !job.sales_nav_url) return;

  // List deleted out from under us?
  const list = await dbGet("SELECT id FROM lists WHERE id = ?", [job.list_id]);
  if (!list) {
    await dbRun("UPDATE list_imports SET status = 'canceled', finished_at = NOW() WHERE id = ?", [importId]);
    return;
  }

  // Today's remaining budget → max whole pages this run
  const cap = await getDailyImportCap();
  const remaining = cap - await importedToday();
  const maxPages = Math.floor(remaining / PAGE_SIZE);
  if (maxPages < 1) {
    await dbRun("UPDATE list_imports SET status = 'scheduled', scheduled_for = ? WHERE id = ?", [
      addDaysStr(todayStr(), 1),
      importId
    ]);
    return;
  }

  console.log(`[import] batch ${importId} (b${job.batch_index}) start_page=${job.start_page} maxPages=${maxPages} cap=${cap}`);
  const { getSessionContext } = await import("@/lib/linkedin/session");
  const { scrapeNavigatorUrl } = await import("@/lib/linkedin/scraper");

  const isCanceled = async () => {
    const r = await dbGet<{ cancel_requested: number }>("SELECT cancel_requested FROM list_imports WHERE id = ?", [importId]);
    return !r || r.cancel_requested === 1; // row deleted (list cascade) or explicit cancel
  };

  try {
    const ctx = await getSessionContext(job.account_id);
    const { profiles, lastPage, knownTotal, exhausted } = await scrapeNavigatorUrl(ctx, job.sales_nav_url, {
      startPage: job.start_page,
      maxPages,
      onProgress: async (p: any) => {
        await dbRun(
          "UPDATE list_imports SET phase = ?, page = ?, total_pages = ?, count = ?, total = ? WHERE id = ?",
          [p.phase, p.page ?? 0, p.totalPages ?? 0, p.count, p.total, importId]
        );
      },
      isCanceled,
    });

    if (await isCanceled()) {
      if (await dbGet("SELECT id FROM list_imports WHERE id = ?", [importId])) {
        await dbRun("UPDATE list_imports SET status = 'canceled', finished_at = NOW() WHERE id = ?", [importId]);
      }
      return;
    }

    const { imported, skipped } = await insertProfiles(null, job.list_id, profiles);
    console.log(`[import] batch ${importId} inserted ${imported} new, skipped ${skipped} (lastPage=${lastPage}, exhausted=${exhausted})`);

    await dbRun(
      `UPDATE list_imports
         SET status = 'done', imported = ?, skipped = ?, count = ?, total = ?, page = ?, total_pages = ?, finished_at = NOW()
       WHERE id = ?`,
      [imported, skipped, profiles.length, knownTotal, lastPage, Math.ceil(knownTotal / PAGE_SIZE), importId]
    );

    // More of the list left → chain the remainder to the next day
    if (!exhausted) {
      await dbRun(
        `INSERT INTO list_imports
           (id, list_id, account_id, sales_nav_url, status, scheduled_for, start_page, batch_index, enrich, total, total_pages, started_at)
         VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          randomUUID(),
          job.list_id,
          job.account_id,
          job.sales_nav_url,
          addDaysStr(todayStr(), 1),
          lastPage + 1,
          job.batch_index + 1,
          job.enrich,
          knownTotal,
          Math.ceil(knownTotal / PAGE_SIZE)
        ]
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[import] FAILED:", message);
    if (await dbGet("SELECT id FROM list_imports WHERE id = ?", [importId])) {
      await dbRun("UPDATE list_imports SET status = 'error', error = ?, finished_at = NOW() WHERE id = ?", [
        message,
        importId
      ]);
    }
    // A "no data intercepted / re-authentication" failure means the session died.
    if (/re-authentication|No data intercepted/i.test(message) && job.account_id) {
      try {
        const { markNeedsReauth } = await import("@/lib/linkedin/session");
        await markNeedsReauth(job.account_id);
      } catch { /* ignore */ }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertProfiles(db: any, listId: string, profiles: any[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  if (profiles.length === 0) return { imported, skipped };

  await dbTransaction(async (conn) => {
    const targetValues = [];
    const targetParams = [];

    for (const p of profiles) {
      const url = p.linkedinUrl ?? p.salesNavUrl;
      targetValues.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      targetParams.push(
        randomUUID(), url, p.salesNavUrl,
        p.firstName, p.lastName, p.fullName,
        p.title, p.company, p.location, p.degree,
        p.objectUrn, p.summary, p.openLink ? 1 : 0,
        p.companyIndustry, p.companyLocation,
        p.tenureMonths, p.spotlightBadges
      );
    }

    await conn.execute(
      `INSERT INTO targets (
         id, linkedin_url, sales_nav_url, first_name, last_name, full_name,
         title, company, location, degree,
         object_urn, summary, open_link, company_industry, company_location,
         tenure_months, spotlight_badges
       ) VALUES ${targetValues.join(", ")}
       ON DUPLICATE KEY UPDATE
         sales_nav_url = VALUES(sales_nav_url),
         first_name = VALUES(first_name),
         last_name = VALUES(last_name),
         full_name = VALUES(full_name),
         title = VALUES(title),
         company = VALUES(company),
         location = VALUES(location),
         degree = VALUES(degree),
         object_urn = VALUES(object_urn),
         summary = VALUES(summary),
         open_link = VALUES(open_link),
         company_industry = VALUES(company_industry),
         company_location = VALUES(company_location),
         tenure_months = VALUES(tenure_months),
         spotlight_badges = VALUES(spotlight_badges)`,
      targetParams
    );

    const urls = profiles.map((p) => p.linkedinUrl ?? p.salesNavUrl);
    const placeholders = urls.map(() => "?").join(",");
    const [rows] = await conn.execute(
      `SELECT id, linkedin_url FROM targets WHERE linkedin_url IN (${placeholders})`,
      urls
    ) as [any[], any];
    const existingTargets = rows as { id: string; linkedin_url: string }[];

    if (existingTargets.length > 0) {
      const linkValues = [];
      const linkParams = [];
      for (const t of existingTargets) {
        linkValues.push("(?, ?)");
        linkParams.push(listId, t.id);
      }

      const [result] = await conn.execute(
        `INSERT IGNORE INTO list_targets (list_id, target_id) VALUES ${linkValues.join(", ")}`,
        linkParams
      ) as [any, any];
      
      imported = result.affectedRows;
      skipped = profiles.length - imported;
    }
  });

  return { imported, skipped };
}
