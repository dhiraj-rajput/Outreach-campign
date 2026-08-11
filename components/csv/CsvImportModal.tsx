/**
 * Reusable CSV import modal:
 * 1. Upload / paste → server preview
 * 2. Tabular preview with inline CRUD (edit cell, delete row, add row)
 * 3. Chunked commit with progress (avoids server timeouts / memory spikes)
 * 4. Shows example CSV format
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  RiUploadCloud2Line,
  RiDeleteBinLine,
  RiAddLine,
  RiDownloadLine,
  RiCloseLine,
  RiCheckLine,
} from "react-icons/ri";
import type { CsvPreviewResult, CsvPreviewRow, CsvChunkResult } from "@/lib/csv/types";

const CHUNK_SIZE = 50;

type Entity = "companies" | "contacts";

interface Props {
  entity: Entity;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  /** Optional list to attach contacts to */
  listId?: string | null;
}

type Phase = "upload" | "preview" | "importing" | "done";

export default function CsvImportModal({ entity, open, onClose, onDone, listId }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [rows, setRows] = useState<CsvPreviewRow[]>([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0, imported: 0, updated: 0, skipped: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const title = entity === "companies" ? "Import Companies" : "Import Contacts";
  const templateUrl =
    entity === "companies" ? "/api/companies/csv-template" : "/api/targets/csv-template";
  const previewUrl =
    entity === "companies" ? "/api/companies/import-csv" : "/api/targets/import-csv";
  const commitUrl = previewUrl;

  const reset = useCallback(() => {
    setPhase("upload");
    setPreview(null);
    setRows([]);
    setProgress({ processed: 0, total: 0, imported: 0, updated: 0, skipped: 0 });
    setImportErrors([]);
    setBusy(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  async function parseFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch(previewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", csv: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to parse CSV");
        return;
      }
      setPreview(data as CsvPreviewResult);
      setRows(data.rows ?? []);
      setPhase("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
    e.target.value = "";
  }

  function updateCell(key: string, col: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r._key === key
          ? {
              ...r,
              data: { ...r.data, [col]: value.trim() || null },
              // clear hard errors when user edits; server will re-validate on commit if needed
              errors: r.errors.length ? [] : r.errors,
            }
          : r
      )
    );
  }

  function deleteRow(key: string) {
    setRows((prev) => prev.filter((r) => r._key !== key));
  }

  function addRow() {
    const cols = preview?.columns ?? [];
    const data: Record<string, string | null> = {};
    for (const c of cols) data[c] = null;
    setRows((prev) => [
      ...prev,
      {
        _key: `new-${Date.now()}`,
        rowNum: prev.length + 2,
        data,
        errors: [],
        warnings: [],
      },
    ]);
  }

  const validCount = useMemo(
    () => rows.filter((r) => r.errors.length === 0).length,
    [rows]
  );

  async function startImport() {
    if (!rows.length) {
      toast.error("No rows to import");
      return;
    }
    setPhase("importing");
    setBusy(true);
    setImportErrors([]);
    let offset = 0;
    let totals = { imported: 0, updated: 0, skipped: 0 };
    const allErrors: string[] = [];
    const total = rows.length;

    try {
      while (offset < total) {
        const res = await fetch(commitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "commit",
            rows,
            offset,
            total,
            chunkSize: CHUNK_SIZE,
            listId: listId ?? undefined,
          }),
        });
        const data = (await res.json()) as CsvChunkResult & { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "Import chunk failed");
          break;
        }
        totals.imported += data.imported;
        totals.updated += data.updated;
        totals.skipped += data.skipped;
        if (data.errors?.length) allErrors.push(...data.errors);
        offset = data.processed;
        setProgress({
          processed: data.processed,
          total: data.total,
          imported: totals.imported,
          updated: totals.updated,
          skipped: totals.skipped,
        });
        if (data.done) break;
      }
      setImportErrors(allErrors);
      setPhase("done");
      toast.success(
        `Import finished: ${totals.imported} new, ${totals.updated} updated, ${totals.skipped} skipped`
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setPhase("preview");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const displayCols = (preview?.columns ?? []).slice(0, 8); // keep table readable

  return (
    <div className="modal modal-open">
      <div className="modal-box bg-base-200 border border-base-300/50 max-w-5xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="font-semibold text-base">{title}</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={handleClose}
            aria-label="Close"
          >
            <RiCloseLine size={18} />
          </button>
        </div>

        {phase === "upload" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-dashed border-base-300 bg-base-300/20 p-8 text-center">
              <RiUploadCloud2Line size={32} className="mx-auto text-base-content/40 mb-3" />
              <p className="text-sm text-base-content/70 mb-3">
                Drop a CSV file or click to browse. Large files are imported in chunks of {CHUNK_SIZE}.
              </p>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 cursor-pointer">
                {busy ? <span className="loading loading-spinner loading-xs" /> : <RiUploadCloud2Line size={15} />}
                Choose CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} disabled={busy} />
              </label>
            </div>

            <div className="rounded-lg border border-base-300/50 bg-base-300/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-base-content/50">Example CSV format</p>
                <a
                  href={templateUrl}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  download
                >
                  <RiDownloadLine size={12} /> Download template
                </a>
              </div>
              <pre className="text-[11px] overflow-x-auto text-base-content/70 whitespace-pre-wrap font-mono leading-relaxed">
                {entity === "companies"
                  ? `name,domain,industry,location,parent_company,projects
Acme Inc,acme.com,SaaS,"Berlin, Germany",Acme Holdings,Product Launch::Q3 GTM::https://acme.com/launch|EMEA Expansion::London office::https://acme.com/emea
Beta GmbH,beta.de,Fintech,Munich,,Core Platform::Payments core::https://beta.de/core`
                  : `linkedin_url,email,first_name,last_name,title,company,company_domain
https://www.linkedin.com/in/jane-doe/,jane@acme.com,Jane,Doe,Head of Marketing,Acme Inc,acme.com
,info@beta.de,,,Reception,Beta GmbH,beta.de`}
              </pre>
              <p className="text-[11px] text-base-content/40 mt-2">
                {entity === "companies"
                  ? "Required: name. Optional: parent_company. Projects: name::description::url separated by |"
                  : "Required: linkedin_url and/or email. company_domain links/creates the company record."}
              </p>
            </div>
          </div>
        )}

        {phase === "preview" && preview && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60 shrink-0">
              <span>
                <strong className="text-base-content">{rows.length}</strong> rows
              </span>
              <span className="text-success">
                <strong>{validCount}</strong> valid
              </span>
              {rows.length - validCount > 0 && (
                <span className="text-error">
                  <strong>{rows.length - validCount}</strong> with errors
                </span>
              )}
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-base-300/50"
                onClick={addRow}
              >
                <RiAddLine size={14} /> Add row
              </button>
            </div>

            <div className="overflow-auto flex-1 rounded-lg border border-base-300/50 min-h-[200px]">
              <table className="table table-xs w-full">
                <thead className="sticky top-0 bg-base-200 z-10">
                  <tr className="text-[10px] uppercase text-base-content/50">
                    <th className="w-8">#</th>
                    {displayCols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                    <th className="w-20">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._key} className={r.errors.length ? "bg-error/5" : ""}>
                      <td className="text-base-content/40">{i + 1}</td>
                      {displayCols.map((c) => (
                        <td key={c} className="p-0.5">
                          <input
                            className="input input-xs input-ghost w-full min-w-[80px] bg-transparent focus:bg-base-300/40"
                            value={r.data[c] ?? ""}
                            onChange={(e) => updateCell(r._key, c, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="text-[10px]">
                        {r.errors.length ? (
                          <span className="text-error" title={r.errors.join("; ")}>
                            {r.errors[0]}
                          </span>
                        ) : r.warnings.length ? (
                          <span className="text-warning/80" title={r.warnings.join("; ")}>
                            ok*
                          </span>
                        ) : (
                          <span className="text-success">ok</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => deleteRow(r._key)}
                        >
                          <RiDeleteBinLine size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 shrink-0 pt-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1"
                disabled={busy || validCount === 0}
                onClick={startImport}
              >
                <RiCheckLine size={15} />
                Import {validCount} row{validCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {phase === "importing" && (
          <div className="py-10 flex flex-col items-center gap-4">
            <span className="loading loading-spinner loading-lg text-primary" />
            <p className="text-sm text-base-content/70">
              Importing… {progress.processed} / {progress.total}
            </p>
            <progress
              className="progress progress-primary w-64"
              value={progress.processed}
              max={Math.max(progress.total, 1)}
            />
            <p className="text-xs text-base-content/50">
              +{progress.imported} new · {progress.updated} updated · {progress.skipped} skipped
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center">
              <RiCheckLine size={24} />
            </div>
            <p className="font-medium">Import complete</p>
            <p className="text-sm text-base-content/60">
              {progress.imported} new · {progress.updated} updated · {progress.skipped} skipped
            </p>
            {importErrors.length > 0 && (
              <div className="w-full max-h-32 overflow-auto text-xs text-error bg-error/5 rounded-lg p-3 border border-error/20">
                {importErrors.slice(0, 20).map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
                {importErrors.length > 20 && <div>…and {importErrors.length - 20} more</div>}
              </div>
            )}
            <button type="button" className="btn btn-primary btn-sm mt-2" onClick={handleClose}>
              Close
            </button>
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={handleClose} />
    </div>
  );
}
