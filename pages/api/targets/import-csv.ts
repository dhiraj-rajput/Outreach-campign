import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import {
  previewContactCsv,
  importContactChunk,
} from "@/lib/csv/contact-csv";
import type { CsvPreviewRow } from "@/lib/csv/types";
import { DEFAULT_CHUNK_SIZE } from "@/lib/csv/types";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const { action } = req.body ?? {};

  if (action === "preview") {
    const csv = req.body?.csv as string | undefined;
    if (!csv || typeof csv !== "string") {
      return res.status(400).json({ error: "csv text required" });
    }
    try {
      const result = previewContactCsv(csv);
      return res.json(result);
    } catch (e) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Failed to parse CSV",
      });
    }
  }

  if (action === "commit") {
    const rows = req.body?.rows as CsvPreviewRow[] | undefined;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "rows array required" });
    }
    const offset = Number(req.body?.offset) || 0;
    const total = Number(req.body?.total) || rows.length;
    const chunkSize = Math.min(
      Math.max(Number(req.body?.chunkSize) || DEFAULT_CHUNK_SIZE, 1),
      200
    );
    const listId =
      typeof req.body?.listId === "string" && req.body.listId
        ? req.body.listId
        : null;

    try {
      const db = getDb();
      const result = importContactChunk(db, rows, {
        offset,
        total,
        chunkSize,
        listId,
      });
      return res.json(result);
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Import failed",
      });
    }
  }

  return res.status(400).json({ error: "action must be 'preview' or 'commit'" });
}
