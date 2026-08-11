/**
 * Company CSV parse / validate / chunked import.
 * Supports parent/child companies and projects (name::description::url triples).
 */
import Papa from "papaparse";
import type DatabaseType from "better-sqlite3";
import { randomUUID } from "crypto";
import type { CsvPreviewRow, CsvPreviewResult, CsvChunkResult } from "./types";
import { DEFAULT_CHUNK_SIZE } from "./types";

type DB = DatabaseType.Database;

export const COMPANY_COLUMNS = [
  "name",
  "domain",
  "industry",
  "location",
  "city",
  "country",
  "website",
  "linkedin_url",
  "notes",
  "description",
  "employee_count",
  "founded_year",
  "phone",
  "annual_revenue",
  "parent_company",
  /**
   * Projects: pipe-separated triples
   *   name::description::url|name2::description2::url2
   */
  "projects",
] as const;

export type CompanyColumn = (typeof COMPANY_COLUMNS)[number];

export interface ProjectInput {
  name: string;
  description: string | null;
  url: string | null;
}

const SAMPLE: Record<CompanyColumn, string> = {
  name: "Acme Inc",
  domain: "acme.com",
  industry: "SaaS",
  location: "Berlin, Germany",
  city: "Berlin",
  country: "Germany",
  website: "https://acme.com",
  linkedin_url: "https://www.linkedin.com/company/acme",
  notes: "Strategic account",
  description: "B2B SaaS platform",
  employee_count: "120",
  founded_year: "2018",
  phone: "+49 30 1234567",
  annual_revenue: "10M-50M",
  parent_company: "Acme Holdings",
  projects:
    "Product Launch::Q3 go-to-market for EU::https://acme.com/launch|EMEA Expansion::Open London office::https://acme.com/emea",
};

export function buildCompanyCsvTemplate(): string {
  const sampleRow = COMPANY_COLUMNS.map((c) => SAMPLE[c]);
  return Papa.unparse({ fields: [...COMPANY_COLUMNS], data: [sampleRow] });
}

function get(row: Record<string, string>, key: string): string | null {
  const v = row[key];
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

/** Parse "name::desc::url|name2::desc2::url2" into ProjectInput[] */
export function parseProjects(raw: string | null): ProjectInput[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split("::").map((s) => s.trim());
      const name = parts[0] || "";
      const description = parts[1] || null;
      const url = parts[2] || null;
      return { name, description: description || null, url: url || null };
    })
    .filter((p) => p.name.length > 0);
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export function previewCompanyCsv(csvText: string): CsvPreviewResult {
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
    for (const col of COMPANY_COLUMNS) {
      data[col] = get(raw, col);
    }
    for (const k of Object.keys(raw)) {
      if (!(k in data)) data[k] = get(raw, k);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.name) errors.push("name is required");
    if (data.employee_count && Number.isNaN(Number(data.employee_count))) {
      errors.push("employee_count must be a number");
    }
    if (data.founded_year && Number.isNaN(Number(data.founded_year))) {
      errors.push("founded_year must be a number");
    }
    if (data.parent_company) {
      warnings.push(`parent_company "${data.parent_company}" will be linked or created if missing`);
    }
    const projects = parseProjects(data.projects);
    if (projects.length) {
      warnings.push(`${projects.length} project(s) will be created/linked`);
    }

    if (errors.length) invalidRows++;
    else validRows++;

    rows.push({
      _key: `r-${rowNum}-${randomUUID().slice(0, 8)}`,
      rowNum,
      data,
      errors,
      warnings,
    });
  });

  return {
    columns: columns.length ? columns : [...COMPANY_COLUMNS],
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows,
    exampleCsv: buildCompanyCsvTemplate(),
  };
}

export interface CompanyImportRow {
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  linkedin_url: string | null;
  notes: string | null;
  description: string | null;
  employee_count: number | null;
  founded_year: number | null;
  phone: string | null;
  annual_revenue: string | null;
  parent_company: string | null;
  projects: ProjectInput[];
}

function rowToImport(r: CsvPreviewRow): CompanyImportRow | null {
  if (r.errors.length || !r.data.name) return null;
  return {
    name: r.data.name!,
    domain: r.data.domain,
    industry: r.data.industry,
    location: r.data.location,
    city: r.data.city,
    country: r.data.country,
    website: r.data.website,
    linkedin_url: r.data.linkedin_url,
    notes: r.data.notes,
    description: r.data.description,
    employee_count: r.data.employee_count ? Number(r.data.employee_count) : null,
    founded_year: r.data.founded_year ? Number(r.data.founded_year) : null,
    phone: r.data.phone,
    annual_revenue: r.data.annual_revenue,
    parent_company: r.data.parent_company,
    projects: parseProjects(r.data.projects),
  };
}

function findCompany(db: DB, nameOrDomain: string): { id: string } | undefined {
  return db
    .prepare(
      `SELECT id FROM companies WHERE name = ? COLLATE NOCASE OR (domain IS NOT NULL AND domain = ? COLLATE NOCASE) LIMIT 1`
    )
    .get(nameOrDomain, nameOrDomain) as { id: string } | undefined;
}

function ensureParent(db: DB, parentRef: string): string {
  const existing = findCompany(db, parentRef);
  if (existing) return existing.id;
  const id = randomUUID();
  const looksLikeDomain = parentRef.includes(".") && !parentRef.includes(" ");
  db.prepare(`INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`).run(
    id,
    looksLikeDomain ? parentRef.split(".")[0] : parentRef,
    looksLikeDomain ? parentRef : null
  );
  return id;
}

function upsertProjects(db: DB, companyId: string, projects: ProjectInput[]) {
  const find = db.prepare(
    `SELECT id FROM projects WHERE company_id = ? AND name = ? COLLATE NOCASE`
  );
  const insert = db.prepare(
    `INSERT INTO projects (id, company_id, name, description, url, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
  );
  const update = db.prepare(
    `UPDATE projects SET
       description = COALESCE(?, description),
       url = COALESCE(?, url)
     WHERE id = ?`
  );
  for (const p of projects) {
    const ex = find.get(companyId, p.name) as { id: string } | undefined;
    if (ex) {
      update.run(p.description, p.url, ex.id);
    } else {
      insert.run(randomUUID(), companyId, p.name, p.description, p.url);
    }
  }
}

export function importCompanyChunk(
  db: DB,
  previewRows: CsvPreviewRow[],
  opts: { offset: number; total: number; chunkSize?: number } = { offset: 0, total: 0 }
): CsvChunkResult {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const slice = previewRows.slice(opts.offset, opts.offset + chunkSize);
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const insert = db.prepare(`
    INSERT INTO companies (
      id, name, domain, industry, location, city, country, website, linkedin_url,
      notes, description, employee_count, founded_year, phone, annual_revenue, parent_company_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const update = db.prepare(`
    UPDATE companies SET
      domain = COALESCE(?, domain),
      industry = COALESCE(?, industry),
      location = COALESCE(?, location),
      city = COALESCE(?, city),
      country = COALESCE(?, country),
      website = COALESCE(?, website),
      linkedin_url = COALESCE(?, linkedin_url),
      notes = COALESCE(?, notes),
      description = COALESCE(?, description),
      employee_count = COALESCE(?, employee_count),
      founded_year = COALESCE(?, founded_year),
      phone = COALESCE(?, phone),
      annual_revenue = COALESCE(?, annual_revenue),
      parent_company_id = COALESCE(?, parent_company_id)
    WHERE id = ?
  `);

  db.transaction(() => {
    for (const pr of slice) {
      const row = rowToImport(pr);
      if (!row) {
        skipped++;
        continue;
      }
      try {
        let parentId: string | null = null;
        if (row.parent_company) parentId = ensureParent(db, row.parent_company);

        const existing = findCompany(db, row.domain ?? row.name);
        if (existing) {
          update.run(
            row.domain, row.industry, row.location, row.city, row.country,
            row.website, row.linkedin_url, row.notes, row.description,
            row.employee_count, row.founded_year, row.phone, row.annual_revenue,
            parentId, existing.id
          );
          if (row.projects.length) upsertProjects(db, existing.id, row.projects);
          updated++;
        } else {
          const id = randomUUID();
          insert.run(
            id, row.name, row.domain, row.industry, row.location, row.city, row.country,
            row.website, row.linkedin_url, row.notes, row.description,
            row.employee_count, row.founded_year, row.phone, row.annual_revenue, parentId
          );
          if (row.projects.length) upsertProjects(db, id, row.projects);
          imported++;
        }
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
