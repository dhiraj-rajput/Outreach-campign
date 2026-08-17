import Papa from "papaparse";
import { randomUUID } from "crypto";
import { dbTransaction } from "@/lib/db";

// User-fillable target fields — everything else on `targets` (URNs, JSON blobs,
// enrichment timestamps, apollo/automation internals) is system-owned and not
// importable. Mirrors the PATCH /api/targets/[id] editable set.
const EDITABLE_FIELDS = [
  "first_name", "last_name", "title", "company", "location",
  "city", "country", "phone", "headline", "summary", "notes",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

// One template covers every case: a pure LinkedIn list, a pure email list (incl.
// generic inboxes like info@company.com), or an export that already has both
// (e.g. a list exported from another tool). Each row just needs linkedin_url
// and/or email filled in — whatever the contact actually has.
const TEMPLATE_COLUMNS = ["linkedin_url", "sales_nav_url", "email", ...EDITABLE_FIELDS] as const;

const SAMPLE_VALUES: Record<EditableField, string> = {
  first_name: "Jane",
  last_name: "Doe",
  title: "Head of Marketing",
  company: "Acme Inc",
  location: "Berlin, Germany",
  city: "Berlin",
  country: "Germany",
  phone: "+49 30 1234567",
  headline: "Head of Marketing @ Acme Inc",
  summary: "10+ years in B2B SaaS marketing.",
  notes: "Met at SaaStr 2026",
};

export function buildCsvTemplate(): string {
  const sample = TEMPLATE_COLUMNS.map((c) =>
    c === "linkedin_url" ? "https://www.linkedin.com/in/example-profile/" :
    c === "sales_nav_url" ? "" :
    c === "email" ? "jane@acme.com" :
    SAMPLE_VALUES[c as EditableField]
  );
  return Papa.unparse({ fields: [...TEMPLATE_COLUMNS], data: [sample] });
}

export interface CsvImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeLinkedinUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.includes("linkedin.com/in/")) return null;
  return trimmed;
}

interface ParsedRow {
  linkedin_url: string | null;
  sales_nav_url: string | null;
  email: string | null;
  full_name: string | null;
  fields: Record<EditableField, string | null>;
}

function get(row: Record<string, string>, key: string): string | null {
  const v = row[key];
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

export async function importCsv(db: any, listId: string, csvText: string): Promise<CsvImportResult> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const rows: ParsedRow[] = [];
  parsed.data.forEach((raw, idx) => {
    const rowNum = idx + 2; // header is row 1
    const fields = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, get(raw, f)])) as Record<EditableField, string | null>;
    const full_name = [fields.first_name, fields.last_name].filter(Boolean).join(" ") || null;

    const rawUrl = get(raw, "linkedin_url");
    const linkedin_url = rawUrl ? normalizeLinkedinUrl(rawUrl) : null;
    if (rawUrl && !linkedin_url) { errors.push(`Row ${rowNum}: "${rawUrl}" is not a valid linkedin.com/in/ URL`); return; }

    const sales_nav_url = get(raw, "sales_nav_url");

    const rawEmail = get(raw, "email");
    let email: string | null = null;
    if (rawEmail) {
      if (!EMAIL_RE.test(rawEmail)) { errors.push(`Row ${rowNum}: "${rawEmail}" is not a valid email`); return; }
      email = rawEmail.toLowerCase();
    }

    if (!linkedin_url && !email) {
      errors.push(`Row ${rowNum}: needs at least a linkedin_url or an email`);
      return;
    }

    rows.push({ linkedin_url, sales_nav_url, email, full_name, fields });
  });

  const editableCols = [...EDITABLE_FIELDS, "full_name", "sales_nav_url"] as const;

  await dbTransaction(async (conn) => {
    for (const row of rows) {
      let targetId: string;
      let isNew: boolean;
      const fieldValues = EDITABLE_FIELDS.map((f) => row.fields[f]);

      if (row.linkedin_url) {
        const [existingResult] = await conn.execute("SELECT id FROM targets WHERE linkedin_url = ?", [row.linkedin_url]) as [any[], any];
        const existing = existingResult[0];
        isNew = !existing;
        targetId = existing?.id ?? randomUUID();
        
        await conn.execute(`
          INSERT INTO targets (id, linkedin_url, email, sales_nav_url, full_name, ${EDITABLE_FIELDS.join(", ")})
          VALUES (?, ?, ?, ?, ?, ${EDITABLE_FIELDS.map(() => "?").join(", ")})
          ON DUPLICATE KEY UPDATE
            email = COALESCE(VALUES(email), targets.email),
            ${editableCols.map((c) => `${c} = COALESCE(VALUES(${c}), targets.${c})`).join(",\n            ")}
        `, [targetId, row.linkedin_url, row.email, row.sales_nav_url, row.full_name, ...fieldValues]);
      } else {
        const [existingResult] = await conn.execute("SELECT id FROM targets WHERE email = ? LIMIT 1", [row.email]) as [any[], any];
        const existing = existingResult[0];
        isNew = !existing;
        
        if (existing) {
          targetId = existing.id;
          await conn.execute(`
            UPDATE targets SET
              ${editableCols.map((c) => `${c} = COALESCE(?, ${c})`).join(",\n              ")}
            WHERE id = ?
          `, [...fieldValues, row.full_name, row.sales_nav_url, targetId]);
        } else {
          targetId = randomUUID();
          await conn.execute(`
            INSERT INTO targets (id, email, full_name, ${EDITABLE_FIELDS.join(", ")}, sales_nav_url)
            VALUES (?, ?, ?, ${EDITABLE_FIELDS.map(() => "?").join(", ")}, ?)
          `, [targetId, row.email, row.full_name, ...fieldValues, row.sales_nav_url]);
        }
      }

      const [linkResult] = await conn.execute("INSERT IGNORE INTO list_targets (list_id, target_id) VALUES (?, ?)", [listId, targetId]) as [any, any];
      if (linkResult.affectedRows > 0) {
        if (isNew) imported++; else updated++;
      } else {
        skipped++; // already in this list, no changes
      }
    }
  });

  return { imported, updated, skipped, errors };
}
