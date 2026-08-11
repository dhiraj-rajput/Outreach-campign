import type { NextApiRequest, NextApiResponse } from "next";
import { buildCompanyCsvTemplate } from "@/lib/csv/company-csv";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }
  const csv = buildCompanyCsvTemplate();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="companies-template.csv"');
  return res.status(200).send(csv);
}
