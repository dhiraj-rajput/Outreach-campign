/**
 * Contact (targets) CSV parse / validate / chunked import for the Contacts page.
 * Reuses the same column set as list CSV import; optional listId linking.
 */
import Papa from "papaparse";
import type DatabaseType from "better-sqlite3";
import { randomUUID } from "crypto";
import type { CsvPreviewRow, CsvPreviewResult, CsvChunkResult } from "./types";
import { DEFAULT_CHUNK_SIZE } from "./types";
import { buildCsvTemplate } from "@/lib/csv-import";

type DB = DatabaseType.Database;

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

function resolveCompanyId(db: DB, name: string | null, domain: string | null): string | null {
  if (domain) {
    const byDomain = db
      .prepare(`SELECT id FROM companies WHERE domain = ? COLLATE NOCASE LIMIT 1`)
      .get(domain) as { id: string } | undefined;
    if (byDomain) return byDomain.id;
  }
  if (name) {
    const byName = db
      .prepare(`SELECT id FROM companies WHERE name = ? COLLATE NOCASE LIMIT 1`)
      .get(name) as { id: string } | undefined;
    if (byName) return byName.id;
    // Create stub company
    const id = randomUUID();
    db.prepare(`INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`).run(id, name, domain);
    return id;
  }
  if (domain) {
    const id = randomUUID();
    const stubName = domain.split(".")[0];
    db.prepare(`INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`).run(id, stubName, domain);
    return id;
  }
  return null;
}

/**
 * Chunked contact import. listId is optional — when set, contacts are also linked to the list.
 */
export function importContactChunk(
  db: DB,
  previewRows: CsvPreviewRow[],
  opts: {
    offset: number;
    total: number;
    chunkSize?: number;
    listId?: string | null;
  }
): CsvChunkResult {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const slice = previewRows.slice(opts.offset, opts.offset + chunkSize);
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const findByLinkedin = db.prepare("SELECT id FROM targets WHERE linkedin_url = ?");
  const findByEmail = db.prepare("SELECT id FROM targets WHERE email = ? LIMIT 1");
  const linkToList = opts.listId
    ? db.prepare("INSERT OR IGNORE INTO list_targets (list_id, target_id) VALUES (?, ?)")
    : null;

  const insertFull = db.prepare(`
    INSERT INTO targets (
      id, linkedin_url, sales_nav_url, email, full_name,
      first_name, last_name, title, company, location, city, country, phone, headline, summary, notes, company_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateById = db.prepare(`
    UPDATE targets SET
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
    WHERE id = ?
  `);

  db.transaction(() => {
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
        const companyId = resolveCompanyId(db, d.company, d.company_domain);

        let targetId: string;
        let isNew = false;

        if (linkedin) {
          const existing = findByLinkedin.get(linkedin) as { id: string } | undefined;
          if (existing) {
            targetId = existing.id;
            updateById.run(
              d.sales_nav_url, email, full_name,
              first, last, d.title, d.company, d.location, d.city, d.country,
              d.phone, d.headline, d.summary, d.notes, companyId, targetId
            );
          } else {
            targetId = randomUUID();
            isNew = true;
            insertFull.run(
              targetId, linkedin, d.sales_nav_url, email, full_name,
              first, last, d.title, d.company, d.location, d.city, d.country,
              d.phone, d.headline, d.summary, d.notes, companyId
            );
          }
        } else if (email) {
          const existing = findByEmail.get(email) as { id: string } | undefined;
          if (existing) {
            targetId = existing.id;
            updateById.run(
              d.sales_nav_url, email, full_name,
              first, last, d.title, d.company, d.location, d.city, d.country,
              d.phone, d.headline, d.summary, d.notes, companyId, targetId
            );
          } else {
            targetId = randomUUID();
            isNew = true;
            insertFull.run(
              targetId, null, d.sales_nav_url, email, full_name,
              first, last, d.title, d.company, d.location, d.city, d.country,
              d.phone, d.headline, d.summary, d.notes, companyId
            );
          }
        } else {
          skipped++;
          continue;
        }

        if (linkToList && opts.listId) {
          linkToList.run(opts.listId, targetId);
        }

        if (isNew) imported++;
        else updated++;
      } catch (e) {
        errors.push(`Row ${pr.rowNum}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }
  })();

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
