import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { dbGet, dbRun, dbTransaction } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import {
  linkedInUrlMatchKey,
  normalizeLinkedInProfileUrl,
} from "@/lib/linkedin/url";

type IncomingPerson = {
  linkedinUrl: string;
  fullName?: string | null;
  headline?: string | null;
  location?: string | null;
  degree?: number | null;
  profileImageUrl?: string | null;
};

type UpsertRow = {
  url: string;
  fullName: string | null;
  headline: string | null;
  location: string | null;
  degree: number | null;
  profileImageUrl: string | null;
};

/**
 * POST /api/linkedin/import-people
 * Body: { list_id: string, people: IncomingPerson[] }
 *
 * Uniqueness: one targets row per canonical https://www.linkedin.com/in/{vanity}.
 * Schema UNIQUE on linkedin_url + request-level dedupe + upsert (never second row).
 * list_targets is many-to-many; same person can sit on many lists without cloning.
 * Later email enrichment updates the same target id.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  if (isRateLimited(req, "li-import-people", 20, 10 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many import requests. Try again later." });
  }

  const { list_id, people } = req.body as {
    list_id?: string;
    people?: IncomingPerson[];
  };

  if (!list_id || typeof list_id !== "string") {
    return res.status(400).json({ error: "list_id is required." });
  }
  if (!Array.isArray(people) || people.length === 0) {
    return res.status(400).json({ error: "people must be a non-empty array." });
  }
  if (people.length > 100) {
    return res.status(400).json({ error: "Import at most 100 people per request." });
  }

  const list = await dbGet<{ id: string; name: string }>("SELECT id, name FROM lists WHERE id = ?", [list_id]);
  if (!list) return res.status(404).json({ error: "List not found." });

  const byKey = new Map<string, UpsertRow>();
  let invalid = 0;
  let dedupedInBatch = 0;

  for (const p of people) {
    const url = normalizeLinkedInProfileUrl(p.linkedinUrl);
    if (!url) {
      invalid++;
      continue;
    }
    const key = linkedInUrlMatchKey(url);
    if (byKey.has(key)) dedupedInBatch++;
    byKey.set(key, {
      url,
      fullName: p.fullName?.trim() || null,
      headline: p.headline?.trim() || null,
      location: p.location?.trim() || null,
      degree: typeof p.degree === "number" && p.degree >= 1 && p.degree <= 3 ? p.degree : null,
      profileImageUrl: p.profileImageUrl?.trim() || null,
    });
  }

  if (byKey.size === 0) {
    return res.status(400).json({
      error: "No valid LinkedIn profile URLs in the payload.",
      invalid,
    });
  }

  const splitName = (full: string | null) => {
    if (!full) return { first: null as string | null, last: null as string | null };
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: null };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  };

  let created = 0;
  let updated = 0;
  let linked = 0;
  let already_on_list = 0;
  let skipped = invalid;
  const targetIds: string[] = [];
  let alreadyHadEmail = 0;

  try {
    await dbTransaction(async (conn) => {
      for (const row of byKey.values()) {
        const { first, last } = splitName(row.fullName);
        const title = row.headline;

        let existing = await conn.execute(
          "SELECT id, linkedin_url, email FROM targets WHERE linkedin_url = ?",
          [row.url]
        ).then((res: any) => res[0]?.[0] as { id: string; linkedin_url: string | null; email: string | null } | undefined);

        if (!existing) {
          existing = await conn.execute(
            `SELECT id, linkedin_url, email FROM targets
             WHERE lower(trim(TRAILING '/' FROM linkedin_url)) = lower(trim(TRAILING '/' FROM ?))
             LIMIT 1`,
            [row.url]
          ).then((res: any) => res[0]?.[0] as { id: string; linkedin_url: string | null; email: string | null } | undefined);
        }

        let id: string;
        if (existing) {
          id = existing.id;
          await conn.execute(`
            UPDATE targets SET
              full_name = CASE WHEN ? IS NOT NULL AND (full_name IS NULL OR full_name = '') THEN ? ELSE full_name END,
              first_name = CASE WHEN ? IS NOT NULL AND (first_name IS NULL OR first_name = '') THEN ? ELSE first_name END,
              last_name = CASE WHEN ? IS NOT NULL AND (last_name IS NULL OR last_name = '') THEN ? ELSE last_name END,
              title = CASE WHEN ? IS NOT NULL AND (title IS NULL OR title = '') THEN ? ELSE title END,
              location = CASE WHEN ? IS NOT NULL AND (location IS NULL OR location = '') THEN ? ELSE location END,
              degree = COALESCE(degree, ?),
              profile_image_url = CASE WHEN ? IS NOT NULL AND (profile_image_url IS NULL OR profile_image_url = '') THEN ? ELSE profile_image_url END,
              headline = CASE WHEN ? IS NOT NULL AND (headline IS NULL OR headline = '') THEN ? ELSE headline END,
              linkedin_url = CASE
                WHEN linkedin_url IS NULL OR linkedin_url = '' THEN ?
                WHEN lower(trim(TRAILING '/' FROM linkedin_url)) = lower(trim(TRAILING '/' FROM ?)) THEN ?
                ELSE linkedin_url
              END
            WHERE id = ?
          `, [
            row.fullName, row.fullName,
            first, first,
            last, last,
            title, title,
            row.location, row.location,
            row.degree,
            row.profileImageUrl, row.profileImageUrl,
            row.headline, row.headline,
            row.url, row.url, row.url,
            id
          ]);
          updated++;
          if (existing.email) alreadyHadEmail++;
        } else {
          id = randomUUID();
          try {
            await conn.execute(`
              INSERT INTO targets (
                id, linkedin_url, full_name, first_name, last_name, title, location,
                degree, profile_image_url, headline
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              id,
              row.url,
              row.fullName,
              first,
              last,
              title,
              row.location,
              row.degree,
              row.profileImageUrl,
              row.headline
            ]);
            created++;
          } catch (e: any) {
            let again = await conn.execute(
              "SELECT id, email FROM targets WHERE linkedin_url = ?",
              [row.url]
            ).then((res: any) => res[0]?.[0] as { id: string; email: string | null } | undefined);

            if (!again) {
              again = await conn.execute(
                `SELECT id, email FROM targets
                 WHERE lower(trim(TRAILING '/' FROM linkedin_url)) = lower(trim(TRAILING '/' FROM ?))
                 LIMIT 1`,
                [row.url]
              ).then((res: any) => res[0]?.[0] as { id: string; email: string | null } | undefined);
            }

            if (!again) {
              console.error("[import-people] unique insert failed", e);
              skipped++;
              continue;
            }
            id = again.id;
            updated++;
            if (again.email) alreadyHadEmail++;
          }
        }

        const onList = await conn.execute(
          "SELECT 1 AS ok FROM list_targets WHERE list_id = ? AND target_id = ?",
          [list_id, id]
        ).then((res: any) => res[0]?.[0] as { ok: number } | undefined);

        if (onList) {
          already_on_list++;
        } else {
          const r = await conn.execute(
            "INSERT IGNORE INTO list_targets (list_id, target_id) VALUES (?, ?)",
            [list_id, id]
          ).then((res: any) => res[0]);
          if (r.affectedRows > 0) linked++;
          else already_on_list++;
        }
        targetIds.push(id);
      }
    });
  } catch (err) {
    console.error("[api/import-people]", err);
    return res.status(500).json({ error: "Failed to import people." });
  }

  console.log(
    `[api/import-people] list=${list_id} unique=${byKey.size} created=${created} updated=${updated} linked=${linked} already_on_list=${already_on_list} batch_dedupe=${dedupedInBatch} invalid=${invalid}`
  );

  return res.status(200).json({
    ok: true,
    list_id,
    list_name: list.name,
    unique_people: byKey.size,
    created,
    updated,
    linked,
    already_on_list,
    deduped_in_batch: dedupedInBatch,
    skipped_invalid: invalid,
    skipped,
    target_ids: targetIds,
    already_had_email: alreadyHadEmail,
    note: "Each person is stored once (unique linkedin_url). Email enrichment later updates the same row without creating duplicates.",
  });
}
