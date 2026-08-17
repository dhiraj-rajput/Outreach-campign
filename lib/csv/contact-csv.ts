/**
 * Contact (targets) CSV parse / validate / chunked import for the Contacts page.
 * Reuses the same column set as list CSV import; optional listId linking.
 */
import Papa from "papaparse";
import { randomUUID } from "crypto";
import type { CsvPreviewRow, CsvPreviewResult, CsvChunkResult } from "./types";
import { DEFAULT_CHUNK_SIZE } from "./types";
import { buildCsvTemplate } from "@/lib/csv-import";
import { dbGet, dbRun, dbTransaction } from "@/lib/db";

const EDITABLE_FIELDS = [
  "first_name", "last_name", "title", "company", "location",
  "city", "country", "phone", "headline", "summary", "notes",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export const CONTACT_COLUMNS = ["linkedin_url", "sales_nav_url", "email", ...EDITABLE_FIELDS, "company_domain"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeLinkedinUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.includes("linkedin.com/in/")) return null;
  return trimmed;
}

function get(row: Record<string, string>, key: string): string | null {
  const v = row[key];
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export function buildContactCsvTemplate(): string {
  // Prefer the shared list template; append company_domain example column
  const base = buildCsvTemplate();
  // Enrich sample with company_domain for contact-page users
  const parsed = Papa.parse<string[]>(base, { header: false });
  const fields = (parsed.data[0] as string[]) ?? [];
  if (!fields.includes("company_domain")) fields.push("company_domain");
  const sample = (parsed.data[1] as string[]) ?? [];
  while (sample.length < fields.length) sample.push("");
  sample[fields.indexOf("company_domain")] = "acme.com";
  return Papa.unparse({ fields, data: [sample] });
}

export function previewContactCsv(csvText: string): CsvPreviewResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  const columns = (parsed.meta.fields ?? []).map(normalizeHeader);
  const rows: CsvPreviewRow[] = [];
  let validRows = 0;
  let invalidRows = 0;

  parsed.data.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const data: Record<string, string | null> = {};
    for (const col of CONTACT_COLUMNS) data[col] = get(raw, col);
    for (const k of Object.keys(raw)) {
      if (!(k in data)) data[k] = get(raw, k);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const linkedin = data.linkedin_url ? normalizeLinkedinUrl(data.linkedin_url) : null;
    if (data.linkedin_url && !linkedin) {
      errors.push(`"${data.linkedin_url}" is not a valid linkedin.com/in/ URL`);
    }
    if (data.email && !EMAIL_RE.test(data.email)) {
      errors.push(`"${data.email}" is not a valid email`);
    }
    if (!linkedin && !data.email) {
      errors.push("needs at least a linkedin_url or an email");
    }
    if (data.company || data.company_domain) {
      warnings.push("company will be linked/created by name or domain when possible");
    }

    if (errors.length) invalidRows++;
    else validRows++;

    rows.push({
      _key: `r-${rowNum}-${randomUUID().slice(0, 8)}`,
      rowNum,
      data: { ...data, linkedin_url: linkedin ?? data.linkedin_url },
      errors,
      warnings,
    });
  });

  return {
    columns: columns.length ? columns : [...CONTACT_COLUMNS],
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows,
    exampleCsv: buildContactCsvTemplate(),
  };
}

async function resolveCompanyId(name: string | null, domain: string | null): Promise<string | null> {
  if (domain) {
    const byDomain = await dbGet<{ id: string }>(
      `SELECT id FROM companies WHERE domain = ? LIMIT 1`,
      [domain]
    );
    if (byDomain) return byDomain.id;
  }
  if (name) {
    const byName = await dbGet<{ id: string }>(
      `SELECT id FROM companies WHERE name = ? LIMIT 1`,
      [name]
    );
    if (byName) return byName.id;
    // Create stub company
    const id = randomUUID();
    await dbRun(`INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`, [id, name, domain]);
    return id;
  }
  if (domain) {
    const id = randomUUID();
    const stubName = domain.split(".")[0];
    await dbRun(`INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`, [id, stubName, domain]);
    return id;
  }
  return null;
}

/**
 * Chunked contact import. listId is optional — when set, contacts are also linked to the list.
 */
export async function importContactChunk(
  previewRows: CsvPreviewRow[],
  opts: {
    offset: number;
    total: number;
    chunkSize?: number;
    listId?: string | null;
  }
): Promise<CsvChunkResult> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const slice = previewRows.slice(opts.offset, opts.offset + chunkSize);
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  await dbTransaction(async () => {
    for (const pr of slice) {
      if (pr.errors.length) {
        skipped++;
        continue;
      }
      const d = pr.data;
      try {
        const linkedin = d.linkedin_url ? normalizeLinkedinUrl(d.linkedin_url) : null;
        const email = d.email ? d.email.toLowerCase() : null;
        const first = d.first_name;
        const last = d.last_name;
        const full_name =
          [first, last].filter(Boolean).join(" ") || null;
        const companyId = await resolveCompanyId(d.company, d.company_domain);

        let targetId: string;
        let isNew = false;

        if (linkedin) {
          const existing = await dbGet<{ id: string }>("SELECT id FROM targets WHERE linkedin_url = ?", [linkedin]);
          if (existing) {
            targetId = existing.id;
            await dbRun(
              `UPDATE targets SET
                sales_nav_url = COALESCE(?, sales_nav_url),
                email = COALESCE(?, email),
                full_name = COALESCE(?, full_name),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                title = COALESCE(?, title),
                company = COALESCE(?, company),
                location = COALESCE(?, location),
                city = COALESCE(?, city),
                country = COALESCE(?, country),
                phone = COALESCE(?, phone),
                headline = COALESCE(?, headline),
                summary = COALESCE(?, summary),
                notes = COALESCE(?, notes),
                company_id = COALESCE(?, company_id)
              WHERE id = ?`,
              [
                d.sales_nav_url, email, full_name,
                first, last, d.title, d.company, d.location, d.city, d.country,
                d.phone, d.headline, d.summary, d.notes, companyId, targetId
              ]
            );
          } else {
            targetId = randomUUID();
            isNew = true;
            await dbRun(
              `INSERT INTO targets (
                id, linkedin_url, sales_nav_url, email, full_name,
                first_name, last_name, title, company, location, city, country, phone, headline, summary, notes, company_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                targetId, linkedin, d.sales_nav_url, email, full_name,
                first, last, d.title, d.company, d.location, d.city, d.country,
                d.phone, d.headline, d.summary, d.notes, companyId
              ]
            );
          }
        } else if (email) {
          const existing = await dbGet<{ id: string }>("SELECT id FROM targets WHERE email = ? LIMIT 1", [email]);
          if (existing) {
            targetId = existing.id;
            await dbRun(
              `UPDATE targets SET
                sales_nav_url = COALESCE(?, sales_nav_url),
                email = COALESCE(?, email),
                full_name = COALESCE(?, full_name),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                title = COALESCE(?, title),
                company = COALESCE(?, company),
                location = COALESCE(?, location),
                city = COALESCE(?, city),
                country = COALESCE(?, country),
                phone = COALESCE(?, phone),
                headline = COALESCE(?, headline),
                summary = COALESCE(?, summary),
                notes = COALESCE(?, notes),
                company_id = COALESCE(?, company_id)
              WHERE id = ?`,
              [
                d.sales_nav_url, email, full_name,
                first, last, d.title, d.company, d.location, d.city, d.country,
                d.phone, d.headline, d.summary, d.notes, companyId, targetId
              ]
            );
          } else {
            targetId = randomUUID();
            isNew = true;
            await dbRun(
              `INSERT INTO targets (
                id, linkedin_url, sales_nav_url, email, full_name,
                first_name, last_name, title, company, location, city, country, phone, headline, summary, notes, company_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                targetId, null, d.sales_nav_url, email, full_name,
                first, last, d.title, d.company, d.location, d.city, d.country,
                d.phone, d.headline, d.summary, d.notes, companyId
              ]
            );
          }
        } else {
          skipped++;
          continue;
        }

        if (opts.listId) {
          await dbRun("INSERT IGNORE INTO list_targets (list_id, target_id) VALUES (?, ?)", [opts.listId, targetId]);
        }

        if (isNew) imported++;
        else updated++;
      } catch (e) {
        errors.push(`Row ${pr.rowNum}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }
  });

  const processed = opts.offset + slice.length;
  return {
    imported,
    updated,
    skipped,
    errors,
    done: processed >= (opts.total || previewRows.length),
    processed,
    total: opts.total || previewRows.length,
  };
}
