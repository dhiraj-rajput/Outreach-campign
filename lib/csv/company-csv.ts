/**
 * Company CSV parse / validate / chunked import.
 * Supports parent/child companies and projects (name::description::url triples).
 */
import Papa from "papaparse";
import { randomUUID } from "crypto";
import type { CsvPreviewRow, CsvPreviewResult, CsvChunkResult } from "./types";
import { DEFAULT_CHUNK_SIZE } from "./types";
import { dbGet, dbRun, dbTransaction } from "@/lib/db";

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
  linkedin_url: "https://linkedin.com/company/acme",
  notes: "Key enterprise prospect",
  description: "B2B productivity platform",
  employee_count: "250",
  founded_year: "2018",
  phone: "+49 30 123456",
  annual_revenue: "$10M - $50M",
  parent_company: "Acme Holdings",
  projects: "Project Alpha::Core redesign::https://alpha.acme.com|Beta API::V2 rollout::",
};

export function buildCompanyCsvTemplate(): string {
  const headers = [...COMPANY_COLUMNS];
  const row = headers.map((h) => {
    const val = SAMPLE[h] ?? "";
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  });
  return `${headers.join(",")}\n${row.join(",")}\n`;
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_\-]+/g, "_");
}

const HEADER_SYNONYMS: Record<string, CompanyColumn> = {
  company: "name",
  company_name: "name",
  organisation: "name",
  organization: "name",
  website_domain: "domain",
  company_domain: "domain",
  web: "website",
  url: "website",
  company_url: "website",
  linkedin: "linkedin_url",
  company_linkedin: "linkedin_url",
  company_linkedin_url: "linkedin_url",
  employees: "employee_count",
  size: "employee_count",
  headcount: "employee_count",
  founded: "founded_year",
  year_founded: "founded_year",
  revenue: "annual_revenue",
  arr: "annual_revenue",
  parent: "parent_company",
  parent_org: "parent_company",
  holding_company: "parent_company",
};

export function parseProjects(raw: string | null | undefined): ProjectInput[] {
  if (!raw || !raw.trim()) return [];
  const entries = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const out: ProjectInput[] = [];
  for (const entry of entries) {
    const [name, description, url] = entry.split("::").map((s) => s.trim());
    if (name) {
      out.push({
        name,
        description: description || null,
        url: url || null,
      });
    }
  }
  return out;
}

export function previewCompanyCsv(csvText: string): CsvPreviewResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const columns: CompanyColumn[] = [];
  const rawFields = parsed.meta.fields ?? [];
  const headerMap: Record<string, CompanyColumn> = {};

  for (const f of rawFields) {
    const direct = (COMPANY_COLUMNS as readonly string[]).includes(f)
      ? (f as CompanyColumn)
      : null;
    const syn = HEADER_SYNONYMS[f];
    const target = direct ?? syn;
    if (target && !columns.includes(target)) {
      columns.push(target);
      headerMap[f] = target;
    }
  }

  const rows: CsvPreviewRow[] = [];
  let validRows = 0;
  let invalidRows = 0;

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const col = headerMap[k];
      if (col && v !== undefined && v !== null) {
        data[col] = String(v).trim();
      }
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.name && !data.domain) {
      errors.push("Row must have at least a name or domain");
    }

    if (data.employee_count && isNaN(Number(data.employee_count))) {
      warnings.push(`Employee count "${data.employee_count}" is not a valid number`);
    }
    if (data.founded_year && isNaN(Number(data.founded_year))) {
      warnings.push(`Founded year "${data.founded_year}" is not a valid number`);
    }

    if (errors.length === 0) validRows++;
    else invalidRows++;

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
  const name = r.data.name?.trim() || (r.data.domain ? r.data.domain.split(".")[0] : "");
  if (!name && !r.data.domain) return null;

  return {
    name: name || r.data.domain || "Unknown",
    domain: r.data.domain ? r.data.domain.toLowerCase().trim() : null,
    industry: r.data.industry || null,
    location: r.data.location || null,
    city: r.data.city || null,
    country: r.data.country || null,
    website: r.data.website || null,
    linkedin_url: r.data.linkedin_url || null,
    notes: r.data.notes || null,
    description: r.data.description || null,
    employee_count: r.data.employee_count ? Number(r.data.employee_count) : null,
    founded_year: r.data.founded_year ? Number(r.data.founded_year) : null,
    phone: r.data.phone || null,
    annual_revenue: r.data.annual_revenue || null,
    parent_company: r.data.parent_company || null,
    projects: parseProjects(r.data.projects),
  };
}

async function findCompany(nameOrDomain: string): Promise<{ id: string } | null> {
  return await dbGet<{ id: string }>(
    `SELECT id FROM companies WHERE name = ? OR (domain IS NOT NULL AND domain = ?) LIMIT 1`,
    [nameOrDomain, nameOrDomain]
  );
}

async function ensureParent(parentRef: string): Promise<string> {
  const existing = await findCompany(parentRef);
  if (existing) return existing.id;
  const id = randomUUID();
  const looksLikeDomain = parentRef.includes(".") && !parentRef.includes(" ");
  await dbRun(`INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`, [
    id,
    looksLikeDomain ? parentRef.split(".")[0] : parentRef,
    looksLikeDomain ? parentRef : null,
  ]);
  return id;
}

async function upsertProjects(companyId: string, projects: ProjectInput[]) {
  for (const p of projects) {
    const ex = await dbGet<{ id: string }>(
      `SELECT id FROM projects WHERE company_id = ? AND name = ?`,
      [companyId, p.name]
    );
    if (ex) {
      await dbRun(
        `UPDATE projects SET
           description = COALESCE(?, description),
           url = COALESCE(?, url)
         WHERE id = ?`,
        [p.description, p.url, ex.id]
      );
    } else {
      await dbRun(
        `INSERT INTO projects (id, company_id, name, description, url, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
        [randomUUID(), companyId, p.name, p.description, p.url]
      );
    }
  }
}

export async function importCompanyChunk(
  previewRows: CsvPreviewRow[],
  opts: { offset: number; total: number; chunkSize?: number } = { offset: 0, total: 0 }
): Promise<CsvChunkResult> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const slice = previewRows.slice(opts.offset, opts.offset + chunkSize);
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  await dbTransaction(async () => {
    for (const pr of slice) {
      const row = rowToImport(pr);
      if (!row) {
        skipped++;
        continue;
      }
      try {
        let parentId: string | null = null;
        if (row.parent_company) parentId = await ensureParent(row.parent_company);

        const existing = await findCompany(row.domain ?? row.name);
        if (existing) {
          await dbRun(
            `UPDATE companies SET
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
            WHERE id = ?`,
            [
              row.domain, row.industry, row.location, row.city, row.country,
              row.website, row.linkedin_url, row.notes, row.description,
              row.employee_count, row.founded_year, row.phone, row.annual_revenue,
              parentId, existing.id
            ]
          );
          if (row.projects.length) await upsertProjects(existing.id, row.projects);
          updated++;
        } else {
          const id = randomUUID();
          await dbRun(
            `INSERT INTO companies (
              id, name, domain, industry, location, city, country, website, linkedin_url,
              notes, description, employee_count, founded_year, phone, annual_revenue, parent_company_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id, row.name, row.domain, row.industry, row.location, row.city, row.country,
              row.website, row.linkedin_url, row.notes, row.description,
              row.employee_count, row.founded_year, row.phone, row.annual_revenue, parentId
            ]
          );
          if (row.projects.length) await upsertProjects(id, row.projects);
          imported++;
        }
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
