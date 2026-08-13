/**
 * POST /api/linkedin/posts/upload-media
 *
 * Accepts base64 image/video/document and stores under public/uploads/posts/
 * Body: { fileBase64: string, filename?: string, mimeType?: string }
 * Returns: { path, url, type, name }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

function detectType(mime: string, filename: string): "image" | "video" | "document" {
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp)$/i.test(filename)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(filename)) return "video";
  return "document";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  try {
    const { fileBase64, filename = "upload", mimeType = "" } = req.body as {
      fileBase64?: string;
      filename?: string;
      mimeType?: string;
    };

    if (!fileBase64) {
      return res.status(400).json({ error: "fileBase64 is required" });
    }

    const matches = fileBase64.match(/^data:([A-Za-z0-9\-+\.\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let mime = mimeType;
    const name = filename;

    if (matches && matches.length === 3) {
      mime = matches[1];
      buffer = Buffer.from(matches[2], "base64");
    } else {
      buffer = Buffer.from(fileBase64, "base64");
    }

    // Derive extension
    let ext = "bin";
    if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
    else if (mime.includes("png")) ext = "png";
    else if (mime.includes("gif")) ext = "gif";
    else if (mime.includes("webp")) ext = "webp";
    else if (mime.includes("mp4")) ext = "mp4";
    else if (mime.includes("pdf")) ext = "pdf";
    else if (mime.includes("msword") || name.endsWith(".doc")) ext = "doc";
    else if (mime.includes("officedocument") || name.endsWith(".docx")) ext = "docx";
    else {
      const m = name.match(/\.([a-z0-9]+)$/i);
      if (m) ext = m[1].toLowerCase();
    }

    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const finalName = `${Date.now()}_${randomUUID().slice(0, 8)}_${safeName}.${ext}`.replace(
      /\.+/g,
      "."
    );

    const uploadDir = path.join(process.cwd(), "public", "uploads", "posts");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, finalName);
    fs.writeFileSync(filePath, buffer);

    const relativePath = `public/uploads/posts/${finalName}`;
    const publicUrl = `/uploads/posts/${finalName}`;
    const type = detectType(mime, finalName);

    return res.json({
      path: relativePath,
      url: publicUrl,
      type,
      name: safeName || finalName,
      size: buffer.length,
    });
  } catch (err) {
    console.error("[upload-media]", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to save media" });
  }
}
