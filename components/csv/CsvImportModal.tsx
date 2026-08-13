/**
 * Reusable CSV import modal:
 * 1. Upload / paste → server preview
 * 2. Tabular preview with multi-select + inline CRUD (edit cell, delete row, add row)
 * 3. Import only selected valid rows (chunked)
 * 4. Example CSV format
 */
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  RiUploadCloud2Line,
  RiDeleteBinLine,
  RiAddLine,
  RiDownloadLine,
  RiCloseLine,
  RiCheckLine,
  RiCheckboxMultipleLine,
} from "react-icons/ri";
import type { CsvPreviewResult, CsvPreviewRow, CsvChunkResult } from "@/lib/csv/types";

const CHUNK_SIZE = 50;

type Entity = "companies" | "contacts";

interface Props {
  entity: Entity;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  listId?: string | null;
}

type Phase = "upload" | "preview" | "importing" | "done";

export default function CsvImportModal({ entity, open, onClose, onDone, listId }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [rows, setRows] = useState<CsvPreviewRow[]>([]);
  /** Keys of rows selected for import */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({
    processed: 0,
    total: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
  });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState("");

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
    setSelected(new Set());
    setProgress({ processed: 0, total: 0, imported: 0, updated: 0, skipped: 0 });
    setImportErrors([]);
    setBusy(false);
    setPasteText("");
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  async function parseCsvText(text: string) {
    setBusy(true);
    try {
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
      const result = data as CsvPreviewResult;
      setPreview(result);
      setRows(result.rows);
      // Select all valid rows by default
      setSelected(new Set(result.rows.filter((r) => r.errors.length === 0).map((r) => r._key)));
      setPhase("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse CSV");
    } finally {
      setBusy(false);
    }
  }

  async function parseFile(file: File) {
    const text = await file.text();
    await parseCsvText(text);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
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
              errors: [], // user edited — clear client errors; server revalidates on commit
            }
          : r
      )
    );
  }

  function deleteRow(key: string) {
    setRows((prev) => prev.filter((r) => r._key !== key));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Remove ${selected.size} selected row(s) from the preview?`)) return;
    setRows((prev) => prev.filter((r) => !selected.has(r._key)));
    setSelected(new Set());
  }

  function addRow() {
    const cols = preview?.columns ?? [];
    const data: Record<string, string | null> = {};
    for (const c of cols) data[c] = null;
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setRows((prev) => [
      ...prev,
      {
        _key: key,
        rowNum: prev.length + 2,
        data,
        errors: [],
        warnings: [],
      },
    ]);
    setSelected((prev) => new Set(prev).add(key));
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllValid() {
    setSelected(new Set(rows.filter((r) => r.errors.length === 0).map((r) => r._key)));
  }

  function selectAll() {
    setSelected(new Set(rows.map((r) => r._key)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  const selectedValidRows = useMemo(
    () => rows.filter((r) => selected.has(r._key) && r.errors.length === 0),
    [rows, selected]
  );

  const validCount = useMemo(() => rows.filter((r) => r.errors.length === 0).length, [rows]);

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r._key));
  const someSelected = selected.size > 0 && !allSelected;

  async function startImport() {
    const toImport = selectedValidRows;
    if (!toImport.length) {
      toast.error("Select at least one valid row to import");
      return;
    }
    setPhase("importing");
    setBusy(true);
    setImportErrors([]);
    let offset = 0;
    const totals = { imported: 0, updated: 0, skipped: 0 };
    const allErrors: string[] = [];
    const total = toImport.length;

    try {
      while (offset < total) {
        const res = await fetch(commitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "commit",
            rows: toImport,
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

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        reset();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, reset, onClose]);

  if (!open) return null;

  // All columns — horizontal scroll instead of truncating to 8
  const displayCols = preview?.columns ?? [];

  return (
    <div className="modal modal-open z-[100]">
      <div className="modal-box bg-base-200 border border-base-300/50 max-w-[96vw] md:max-w-4xl xl:max-w-6xl w-full max-h-[92dvh] flex flex-col p-0 overflow-hidden rounded-xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300/50 shrink-0">
          <h3 className="font-semibold text-base">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={handleClose} aria-label="Close">
            <RiCloseLine size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {phase === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-base-content/60">
                Drop a CSV file or paste CSV text. You can edit, multi-select, and import only the rows you need.
                Large files import in chunks of {CHUNK_SIZE}.
              </p>
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-base-300 rounded-xl p-6 sm:p-10 cursor-pointer hover:border-primary/50 hover:bg-base-300/20 transition">
                <RiUploadCloud2Line className="text-3xl text-base-content/40" />
                <span className="text-sm font-medium">Click or drop CSV here</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} disabled={busy} />
              </label>
              <div className="divider text-xs text-base-content/40">or paste CSV</div>
              <textarea
                className="textarea textarea-bordered w-full h-28 text-xs font-mono"
                placeholder="Paste CSV content here…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !pasteText.trim()}
                  onClick={() => parseCsvText(pasteText)}
                >
                  {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                  Preview pasted CSV
                </button>
                <a href={templateUrl} className="btn btn-ghost btn-sm gap-1" download>
                  <RiDownloadLine size={14} /> Download template
                </a>
              </div>
              {preview?.exampleCsv && (
                <pre className="text-[10px] bg-base-300/40 rounded-lg p-3 overflow-auto max-h-24 text-base-content/50">
                  {preview.exampleCsv}
                </pre>
              )}
            </div>
          )}

          {phase === "preview" && preview && (
            <div className="flex flex-col gap-3 min-h-0">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60 shrink-0">
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
                <span className="text-primary">
                  <strong>{selected.size}</strong> selected
                </span>
                <span className="text-primary/80">
                  <strong>{selectedValidRows.length}</strong> will import
                </span>

                <div className="flex flex-wrap gap-1 ml-auto">
                  <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={selectAllValid} title="Select all valid">
                    <RiCheckboxMultipleLine size={13} /> Valid
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={selectAll}>
                    All
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={selectNone}>
                    None
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    disabled={selected.size === 0}
                    onClick={deleteSelected}
                  >
                    <RiDeleteBinLine size={13} /> Delete selected
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={addRow}>
                    <RiAddLine size={14} /> Add row
                  </button>
                </div>
              </div>

              <div className="overflow-auto flex-1 rounded-lg border border-base-300/50 min-h-[220px] max-h-[50vh]">
                <table className="table table-xs w-full">
                  <thead className="sticky top-0 bg-base-200 z-10">
                    <tr className="text-[10px] uppercase text-base-content/50">
                      <th className="w-10 sticky left-0 bg-base-200 z-20">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs checkbox-primary"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={() => (allSelected ? selectNone() : selectAll())}
                          title="Select all"
                        />
                      </th>
                      <th className="w-8">#</th>
                      {displayCols.map((c) => (
                        <th key={c} className="whitespace-nowrap min-w-[100px]">
                          {c}
                        </th>
                      ))}
                      <th className="w-24">Status</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isSel = selected.has(r._key);
                      return (
                        <tr
                          key={r._key}
                          className={`${r.errors.length ? "bg-error/5" : ""} ${isSel ? "bg-primary/5" : ""}`}
                        >
                          <td className="sticky left-0 bg-inherit z-10">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs checkbox-primary"
                              checked={isSel}
                              onChange={() => toggleRow(r._key)}
                            />
                          </td>
                          <td className="text-base-content/40">{i + 1}</td>
                          {displayCols.map((c) => (
                            <td key={c} className="p-0.5">
                              <input
                                type="text"
                                className="input input-xs input-bordered w-full min-w-[90px] bg-base-100 focus:border-primary"
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
                              title="Delete row"
                            >
                              <RiDeleteBinLine size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-base-content/40">
                Tip: edit any cell inline, check only the rows you want, then Import. Unchecked rows are skipped.
              </p>
            </div>
          )}

          {phase === "importing" && (
            <div className="py-10 flex flex-col items-center gap-4">
              <span className="loading loading-spinner loading-lg text-primary" />
              <p className="text-sm text-base-content/70">
                Importing… {progress.processed} / {progress.total}
              </p>
              <progress
                className="progress progress-primary w-full max-w-xs"
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
            </div>
          )}
        </div>

        {/* Footer actions */}
        {phase === "preview" && (
          <div className="flex flex-wrap justify-end gap-2 px-4 sm:px-5 py-3 border-t border-base-300/50 shrink-0">
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1"
              disabled={busy || selectedValidRows.length === 0}
              onClick={startImport}
            >
              <RiCheckLine size={15} />
              Import {selectedValidRows.length} selected
              {selectedValidRows.length === 1 ? " row" : " rows"}
            </button>
          </div>
        )}
        {phase === "done" && (
          <div className="flex justify-end px-5 py-3 border-t border-base-300/50 shrink-0">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleClose}>
              Close
            </button>
          </div>
        )}
      </div>
      <div className="modal-backdrop bg-black/40" onClick={() => !busy && handleClose()} />
    </div>
  );
}
