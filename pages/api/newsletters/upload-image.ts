/**
 * POST /api/newsletters/upload-image
 *
 * Accepts an image upload (base64 or multipart body) and saves it to public/uploads/newsletters/
 * Returns: { url: "/uploads/newsletters/{filename}" }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  try {
    const { imageBase64, filename } = req.body as { imageBase64?: string; filename?: string };

    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 payload is required" });
    }

    // Strip header prefix if present (e.g. data:image/png;base64,)
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let ext = "png";

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
      else if (mime.includes("svg")) ext = "svg";
      else if (mime.includes("webp")) ext = "webp";
      buffer = Buffer.from(matches[2], "base64");
    } else {
      buffer = Buffer.from(imageBase64, "base64");
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "newsletters");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeFilename = `banner_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = path.join(uploadDir, safeFilename);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/newsletters/${safeFilename}`;
    return res.json({ url: publicUrl, filename: safeFilename });
  } catch (err) {
    console.error("[upload-image] error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to save banner image" });
  }
}
