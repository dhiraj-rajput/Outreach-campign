import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  RiCheckboxCircleLine, RiCheckboxBlankCircleLine, RiAddLine, RiSearchLine,
  RiCalendarLine, RiDeleteBinLine, RiExternalLinkLine, RiFilterLine,
  RiRefreshLine, RiTimeLine, RiAlertLine, RiCheckDoubleLine, RiUserLine,
} from "react-icons/ri";
import type { TodoRow } from "./api/todos/index";

type Summary = {
  total: number; open_count: number; done_count: number;
  overdue: number; due_today: number; due_week: number;
};
type StatusFilter = "all" | "open" | "done" | "overdue" | "today" | "week";

function isOverdue(todo: TodoRow): boolean {
  if (todo.status !== "open" || !todo.due_date) return false;
  return todo.due_date < new Date().toISOString().slice(0, 10);
}
function isDueToday(todo: TodoRow): boolean {
  if (todo.status !== "open" || !todo.due_date) return false;
  return todo.due_date === new Date().toISOString().slice(0, 10);
}
function formatDue(due: string | null): string {
  if (!due) return "No due date";
  const today = new Date().toISOString().slice(0, 10);
  if (due === today) return "Today";
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (due === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Date(due + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function PipelineCard({ label, value, color, icon, active, onClick }: {
  label: string; value: number; color: string; icon: React.ReactNode; active?: boolean; onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left bg-base-200 border rounded-xl p-4 transition-all hover:border-base-300 ${active ? "border-primary/50 ring-1 ring-primary/30" : "border-base-300/50"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs" style={{ background: `${color}18`, color }}>{icon}</span>
        <span className="text-2xl font-semibold tabular-nums text-base-content">{value}</span>
      </div>
      <div className="text-xs text-base-content/45">{label}</div>
    </button>
  );
}

export default function TodosPage() {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status === "open" || status === "done") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/todos?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTodos(data.todos ?? []);
      setSummary(data.summary ?? null);
    } catch { toast.error("Failed to load todos"); }
    finally { setLoading(false); }
  }, [status, q]);

  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  const filtered = useMemo(() => {
    if (status === "overdue") return todos.filter(isOverdue);
    if (status === "today") return todos.filter(isDueToday);
    if (status === "week") {
      const today = new Date().toISOString().slice(0, 10);
      const week = new Date(); week.setDate(week.getDate() + 7);
      const weekStr = week.toISOString().slice(0, 10);
      return todos.filter((t) => t.status === "open" && t.due_date && t.due_date >= today && t.due_date <= weekStr);
    }
    return todos;
  }, [todos, status]);

  async function toggle(todo: TodoRow) {
    const next = todo.status === "open" ? "done" : "open";
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) { toast.error("Could not update todo"); return; }
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, status: next } : t)));
    setSummary((s) => s ? { ...s, open_count: s.open_count + (next === "open" ? 1 : -1), done_count: s.done_count + (next === "done" ? 1 : -1) } : s);
  }

  async function remove(id: string) {
    if (!confirm("Delete this todo?")) return;
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    setTodos((prev) => prev.filter((t) => t.id !== id));
    toast.success("Todo deleted");
    load();
  }

  return (
    <>
      <Head><title>Todos — Linki</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-base-content flex items-center gap-2">
              <RiCheckboxCircleLine className="text-base-content/40" /> CRM Pipeline · Todos
            </h1>
            <p className="text-sm text-base-content/40 mt-0.5">Follow-ups, call tasks, and action items across your contacts.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => load()} className="btn btn-sm btn-ghost gap-1.5" title="Refresh"><RiRefreshLine size={14} /></button>
            <button type="button" onClick={() => setShowCreate(true)} className="btn btn-sm btn-primary gap-1.5"><RiAddLine size={14} /> New todo</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <PipelineCard label="Open" value={summary?.open_count ?? 0} color="#fb923c" icon={<RiCheckboxBlankCircleLine size={14} />} active={status === "open"} onClick={() => setStatus("open")} />
          <PipelineCard label="Overdue" value={summary?.overdue ?? 0} color="#f87171" icon={<RiAlertLine size={14} />} active={status === "overdue"} onClick={() => setStatus("overdue")} />
          <PipelineCard label="Due today" value={summary?.due_today ?? 0} color="#f4b740" icon={<RiTimeLine size={14} />} active={status === "today"} onClick={() => setStatus("today")} />
          <PipelineCard label="This week" value={summary?.due_week ?? 0} color="#5aa2ff" icon={<RiCalendarLine size={14} />} active={status === "week"} onClick={() => setStatus("week")} />
          <PipelineCard label="Done" value={summary?.done_count ?? 0} color="#32d583" icon={<RiCheckDoubleLine size={14} />} active={status === "done"} onClick={() => setStatus("done")} />
          <PipelineCard label="All" value={summary?.total ?? 0} color="#a78bfa" icon={<RiFilterLine size={14} />} active={status === "all"} onClick={() => setStatus("all")} />
        </div>

        <div className="relative max-w-md">
          <RiSearchLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search todos, contacts, companies…"
            className="w-full pl-9 pr-3 py-2 bg-base-200 border border-base-300/50 rounded-xl text-sm focus:outline-none focus:border-base-300" />
        </div>

        <div className="bg-base-200 border border-base-300/50 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-base-content/40">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <RiCheckboxCircleLine className="mx-auto text-base-content/20 mb-2" size={28} />
              <p className="text-sm text-base-content/40">No todos in this view</p>
              <p className="text-xs text-base-content/30 mt-1">Create tasks from a contact page or use New todo.</p>
            </div>
          ) : (
            <ul className="divide-y divide-base-300/40">
              {filtered.map((todo) => {
                const overdue = isOverdue(todo);
                return (
                  <li key={todo.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-base-300/20 transition-colors group">
                    <button type="button" onClick={() => toggle(todo)} className="mt-0.5 shrink-0 text-base-content/40 hover:text-success transition-colors"
                      title={todo.status === "open" ? "Mark done" : "Reopen"}>
                      {todo.status === "done" ? <RiCheckboxCircleLine size={18} className="text-success" /> : <RiCheckboxBlankCircleLine size={18} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${todo.status === "done" ? "text-base-content/40 line-through" : "text-base-content"}`}>{todo.title}</p>
                          {todo.description && <p className="text-xs text-base-content/45 mt-0.5 line-clamp-2">{todo.description}</p>}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-base-content/40">
                            {todo.full_name && (
                              <Link href={`/contacts/${todo.target_id}`} className="inline-flex items-center gap-1 hover:text-primary">
                                <RiUserLine size={12} />{todo.full_name}{todo.company ? ` · ${todo.company}` : ""}
                              </Link>
                            )}
                            <span className={`inline-flex items-center gap-1 ${overdue ? "text-error" : isDueToday(todo) ? "text-warning" : ""}`}>
                              <RiCalendarLine size={12} />{formatDue(todo.due_date)}{overdue ? " · overdue" : ""}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Link href={`/contacts/${todo.target_id}`} className="p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-300/50" title="Open contact">
                            <RiExternalLinkLine size={14} />
                          </Link>
                          <button type="button" onClick={() => remove(todo.id)} className="p-1.5 rounded-lg text-base-content/40 hover:text-error hover:bg-error/10" title="Delete">
                            <RiDeleteBinLine size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTodoModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); toast.success("Todo created"); }} />
      )}
    </>
  );
}

function CreateTodoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contactQ, setContactQ] = useState("");
  const [contacts, setContacts] = useState<{ id: string; full_name: string | null; email: string | null; company: string | null }[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!contactQ.trim() || contactQ.trim().length < 2) { setContacts([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/targets?search=${encodeURIComponent(contactQ.trim())}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setContacts(Array.isArray(data) ? data : data.targets ?? data.rows ?? []);
        }
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [contactQ]);

  async function save() {
    if (!title.trim() || !targetId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId, title: title.trim(), description: description.trim() || null, due_date: dueDate || null }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error ?? "Failed to create"); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-base-100 border border-base-300/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-base-300/40">
          <h2 className="text-sm font-semibold text-base-content">New todo</h2>
          <button type="button" onClick={onClose} className="text-base-content/40 hover:text-base-content text-sm">Close</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] text-base-content/40 uppercase tracking-wide mb-1.5">Contact</label>
            {targetId ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm">
                <span className="truncate">{selectedLabel}</span>
                <button type="button" className="text-xs text-base-content/50 hover:text-base-content" onClick={() => { setTargetId(null); setSelectedLabel(""); setContactQ(""); }}>Change</button>
              </div>
            ) : (
              <div className="relative">
                <input value={contactQ} onChange={(e) => setContactQ(e.target.value)} placeholder="Search contacts by name or email…"
                  className="w-full px-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm focus:outline-none focus:border-base-300" />
                {(searching || contacts.length > 0) && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-base-200 border border-base-300/50 rounded-xl shadow-lg max-h-48 overflow-auto">
                    {searching && <div className="px-3 py-2 text-xs text-base-content/40">Searching…</div>}
                    {contacts.map((c) => (
                      <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-base-300/40"
                        onClick={() => { setTargetId(c.id); setSelectedLabel([c.full_name, c.email, c.company].filter(Boolean).join(" · ")); setContacts([]); setContactQ(""); }}>
                        <span className="font-medium">{c.full_name ?? "Unnamed"}</span>
                        {c.email && <span className="text-base-content/40 text-xs ml-2">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] text-base-content/40 uppercase tracking-wide mb-1.5">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call back, send proposal…"
              className="w-full px-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm focus:outline-none focus:border-base-300" />
          </div>
          <div>
            <label className="block text-[11px] text-base-content/40 uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional details…"
              className="w-full px-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm focus:outline-none focus:border-base-300 resize-none" />
          </div>
          <div>
            <label className="block text-[11px] text-base-content/40 uppercase tracking-wide mb-1.5">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-48 px-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm focus:outline-none focus:border-base-300" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-base-300/40">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">Cancel</button>
          <button type="button" onClick={save} disabled={!title.trim() || !targetId || saving} className="btn btn-sm btn-primary">
            {saving ? "Saving…" : "Create todo"}
          </button>
        </div>
      </div>
    </div>
  );
}
