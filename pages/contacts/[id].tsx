import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useRef, useEffect } from "react";
import { GetServerSideProps } from "next";
import { dbGet, dbAll } from "@/lib/db";
import { toast } from "sonner";
import {
  RiArrowLeftLine, RiExternalLinkLine, RiMailLine, RiBuilding2Line,
  RiUserFollowLine, RiUserAddLine, RiMapPinLine, RiBriefcaseLine,
  RiTimeLine, RiGlobalLine, RiLinkedinBoxLine, RiCheckboxCircleLine,
  RiEditLine, RiCheckLine, RiCloseLine, RiFlowChart,
  RiCheckboxBlankCircleLine, RiDeleteBinLine, RiCalendarLine,
  RiAddLine, RiCloseCircleLine, RiPhoneLine, RiForbid2Line,
} from "react-icons/ri";

interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  linkedin_url: string | null;
  website: string | null;
}

interface ListRef {
  id: string;
  name: string;
}

interface CampaignRun {
  run_id: string;
  workflow_id: string;
  workflow_name: string;
  state: string;
  current_step: number;
  error_message: string | null;
  enrolled_at: string;
  logs: { id: string; level: string; message: string; created_at: string }[];
}

interface Todo {
  id: string;
  target_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "open" | "done";
  created_at: string;
}

interface ActivityLog {
  id: string;
  target_id: string;
  type: "call" | "email" | "meeting" | "note" | "other";
  body: string;
  logged_at: string;
  created_at: string;
}

interface Target {
  id: string;
  linkedin_url: string | null;
  sales_nav_url: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  company_name: string | null; // renamed from DB 'company' to avoid collision
  location: string | null;
  degree: number | null;
  headline: string | null;
  summary: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  seniority: string | null;
  apollo_functions: string | null;
  apollo_id: string | null;
  apollo_enriched_at: string | null;
  company_description: string | null;
  company_size: number | null;
  company_industry: string | null;
  company_location: string | null;
  tenure_months: number | null;
  positions_json: string | null;
  connection_requested_at: string | null;
  connected_at: string | null;
  message_sent_at: string | null;
  last_replied_at: string | null;
  created_at: string;
  enriched_profile_at: string | null;
  notes: string | null;
  company_id: string | null;
  unsubscribed_at: string | null;
  companyObj: Company | null;
  lists: ListRef[];
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const id = params?.id as string;
  const target = await dbGet<Target>("SELECT * FROM targets WHERE id = ?", [id]);
  if (!target) return { notFound: true };

  const companyObj = target.company_id
    ? await dbGet<Company>("SELECT * FROM companies WHERE id = ?", [target.company_id]) ?? null
    : null;

  const lists = await dbAll<ListRef>(`
    SELECT l.id, l.name FROM lists l
    INNER JOIN list_targets lt ON lt.list_id = l.id
    WHERE lt.target_id = ? ORDER BY l.name
  `, [id]);

  const allLists = await dbAll<ListRef>(`SELECT id, name FROM lists ORDER BY name`);

  const runRows = await dbAll<Omit<CampaignRun, "logs">>(`
    SELECT rp.run_id, r.workflow_id, w.name as workflow_name,
           COALESCE(rt_li.state, 'pending') as state,
           COALESCE(rt_li.current_step, 0) as current_step,
           rt_li.error_message,
           rp.created_at as enrolled_at
    FROM run_profiles rp
    JOIN runs r ON r.id = rp.run_id
    JOIN workflows w ON w.id = r.workflow_id
    LEFT JOIN run_profile_tracks rt_li ON rt_li.run_profile_id = rp.id AND rt_li.track = 'linkedin'
    WHERE rp.target_id = ?
    ORDER BY rp.created_at DESC
  `, [id]);

  const logRows = await dbAll<{ id: string; run_id: string; level: string; message: string; created_at: string }>(`
    SELECT id, run_id, level, message, created_at
    FROM logs
    WHERE target_id = ?
    ORDER BY created_at ASC
  `, [id]);

  const logsByRun: Record<string, typeof logRows> = {};
  for (const log of logRows) {
    if (!logsByRun[log.run_id]) logsByRun[log.run_id] = [];
    logsByRun[log.run_id].push(log);
  }

  const campaignHistory: CampaignRun[] = runRows.map((r) => ({
    ...r,
    logs: logsByRun[r.run_id] ?? [],
  }));

  const todos = await dbAll<Todo>(
    "SELECT * FROM todos WHERE target_id = ? ORDER BY status ASC, due_date ASC, created_at DESC",
    [id]
  );

  const activityLogs = await dbAll<ActivityLog>(
    "SELECT * FROM activity_logs WHERE target_id = ? ORDER BY logged_at DESC",
    [id]
  );

  // rename DB 'company' text field to avoid TS collision with Company object
  const rawTarget = target as unknown as Record<string, unknown>;
  const { company: company_name, ...rest } = rawTarget;
  return { props: { target: { ...rest, company_name, companyObj, lists }, campaignHistory, todos, activityLogs, allLists } };
};

const LOG_TYPE_ICONS: Record<string, string> = {
  call: "📞", email: "✉️", meeting: "🤝", note: "📝", other: "•",
};
const LOG_TYPE_COLORS: Record<string, string> = {
  call: "bg-blue-500/15 text-blue-400",
  email: "bg-violet-500/15 text-violet-400",
  meeting: "bg-emerald-500/15 text-emerald-400",
  note: "bg-base-300 text-base-content/50",
  other: "bg-base-300 text-base-content/50",
};

function TodoDetailModal({ todo, onClose, onSave }: {
  todo: Todo;
  onClose: () => void;
  onSave: (updated: Todo) => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || null, due_date: dueDate || null }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save"); return; }
    onSave({ ...todo, title: title.trim(), description: description.trim() || null, due_date: dueDate || null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-base-100 border border-base-300/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-base-300/40">
          <h2 className="text-sm font-semibold text-base-content">Edit todo</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-300/50 transition-colors">
            <RiCloseLine size={16} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Task title"
            className="w-full bg-transparent text-base font-medium text-base-content placeholder-base-content/25 focus:outline-none border-b border-base-300/30 pb-3"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={5}
            className="w-full bg-base-200/60 border border-base-300/40 rounded-xl px-4 py-3 text-sm text-base-content/80 placeholder-base-content/25 leading-relaxed focus:outline-none focus:border-base-300/80 resize-none transition-colors"
          />
          <div>
            <label className="block text-[11px] text-base-content/40 uppercase tracking-wide mb-1.5">Due date</label>
            <div className="relative w-48">
              <RiCalendarLine size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm text-base-content/80 focus:outline-none focus:border-base-300/80 transition-colors"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-base-300/40">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-base-content/50 hover:text-base-content hover:bg-base-300/40 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || saving}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary/90 text-primary-content hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogDetailModal({ log, onClose, onSave }: {
  log: ActivityLog;
  onClose: () => void;
  onSave: (updated: ActivityLog) => void;
}) {
  const [type, setType] = useState<ActivityLog["type"]>(log.type);
  const [body, setBody] = useState(log.body);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/activity-logs?id=${log.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, body: body.trim() }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save"); return; }
    onSave({ ...log, type, body: body.trim() });
  }

  const types = ["note", "call", "email", "meeting", "other"] as const;
  const placeholders: Record<string, string> = {
    note: "Write your note...",
    call: "What was discussed on this call?",
    email: "Summary of the email sent or received...",
    meeting: "What happened in this meeting?",
    other: "Describe the activity...",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-base-100 border border-base-300/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-base-300/40">
          <h2 className="text-sm font-semibold text-base-content">Edit activity</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-300/50 transition-colors">
            <RiCloseLine size={16} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="flex gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  type === t
                    ? LOG_TYPE_COLORS[t] + " ring-1 ring-inset ring-current/20"
                    : "bg-base-200 text-base-content/40 hover:text-base-content/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholders[type]}
            rows={6}
            className="w-full bg-base-200/60 border border-base-300/40 rounded-xl px-4 py-3 text-sm text-base-content/80 placeholder-base-content/25 leading-relaxed focus:outline-none focus:border-base-300/80 resize-none transition-colors"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-base-300/40">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-base-content/50 hover:text-base-content hover:bg-base-300/40 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!body.trim() || saving}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary/90 text-primary-content hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoModal({ targetId, onClose, onSave }: {
  targetId: string;
  onClose: () => void;
  onSave: (todo: Todo) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId, title: title.trim(), description: description.trim() || undefined, due_date: dueDate || undefined }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to create"); return; }
    onSave(await res.json() as Todo);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-base-100 border border-base-300/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-base-300/40">
          <h2 className="text-sm font-semibold text-base-content">New todo</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-300/50 transition-colors">
            <RiCloseLine size={16} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Task title"
            className="w-full bg-transparent text-base font-medium text-base-content placeholder-base-content/25 focus:outline-none border-b border-base-300/30 pb-3"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={4}
            className="w-full bg-base-200/60 border border-base-300/40 rounded-xl px-4 py-3 text-sm text-base-content/80 placeholder-base-content/25 leading-relaxed focus:outline-none focus:border-base-300/80 resize-none transition-colors"
          />
          <div>
            <label className="block text-[11px] text-base-content/40 uppercase tracking-wide mb-1.5">Due date</label>
            <div className="relative w-48">
              <RiCalendarLine size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-base-200/60 border border-base-300/40 rounded-xl text-sm text-base-content/80 focus:outline-none focus:border-base-300/80 transition-colors"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-base-300/40">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-base-content/50 hover:text-base-content hover:bg-base-300/40 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || saving}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary/90 text-primary-content hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Create todo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogModal({ targetId, onClose, onSave }: {
  targetId: string;
  onClose: () => void;
  onSave: (log: ActivityLog) => void;
}) {
  const [type, setType] = useState<ActivityLog["type"]>("note");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    const res = await fetch("/api/activity-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId, type, body: body.trim() }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to log"); return; }
    onSave(await res.json() as ActivityLog);
    toast.success("Activity logged");
  }

  const types = ["note", "call", "email", "meeting", "other"] as const;
  const placeholders: Record<string, string> = {
    note: "Write your note...",
    call: "What was discussed on this call?",
    email: "Summary of the email sent or received...",
    meeting: "What happened in this meeting?",
    other: "Describe the activity...",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-base-100 border border-base-300/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-base-300/40">
          <h2 className="text-sm font-semibold text-base-content">Log activity</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-300/50 transition-colors">
            <RiCloseLine size={16} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Type selector */}
          <div className="flex gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  type === t
                    ? LOG_TYPE_COLORS[t] + " ring-1 ring-inset ring-current/20"
                    : "bg-base-200 text-base-content/40 hover:text-base-content/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholders[type]}
            rows={6}
            className="w-full bg-base-200/60 border border-base-300/40 rounded-xl px-4 py-3 text-sm text-base-content/80 placeholder-base-content/25 leading-relaxed focus:outline-none focus:border-base-300/80 resize-none transition-colors"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-base-300/40">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-base-content/50 hover:text-base-content hover:bg-base-300/40 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!body.trim() || saving}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary/90 text-primary-content hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Logging..." : "Log activity"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-base-content/80">{value}</div>
    </div>
  );
}

function formatDate(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTenure(months: number | null) {
  if (!months) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y > 0 ? `${y}y` : null, m > 0 ? `${m}mo` : null].filter(Boolean).join(" ");
}

export default function ContactDetailPage({
  target, campaignHistory, todos: initialTodos, activityLogs: initialLogs, allLists,
}: {
  target: Target;
  campaignHistory: CampaignRun[];
  todos: Todo[];
  activityLogs: ActivityLog[];
  allLists: ListRef[];
}) {
  const functions: string[] = target.apollo_functions ? JSON.parse(target.apollo_functions) : [];
  const positions: { title: string; companyName: string; startDate?: string; endDate?: string; current?: boolean; description?: string }[] =
    target.positions_json ? JSON.parse(target.positions_json) : [];

  const [email, setEmail] = useState(target.email ?? "");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(target.email ?? "");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [unsubscribedAt, setUnsubscribedAt] = useState(target.unsubscribed_at ?? null);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const router = useRouter();

  const [phone, setPhone] = useState(target.phone ?? "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(target.phone ?? "");
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState(target.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(target.notes ?? "");

  const [memberLists, setMemberLists] = useState<ListRef[]>(target.lists);
  const [showAddList, setShowAddList] = useState(false);
  const [addListId, setAddListId] = useState("");
  const [addListLoading, setAddListLoading] = useState(false);
  const [removingListId, setRemovingListId] = useState<string | null>(null);

  const addableLists = allLists.filter((l) => !memberLists.some((ml) => ml.id === l.id));

  async function addToList() {
    if (!addListId) return;
    setAddListLoading(true);
    const res = await fetch(`/api/lists/${addListId}/add-members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: [target.id] }),
    });
    setAddListLoading(false);
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to add to list"); return; }
    const added = allLists.find((l) => l.id === addListId);
    if (added) setMemberLists((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success(data.added > 0 ? "Added to list" : "Already in this list");
    setShowAddList(false);
    setAddListId("");
  }

  async function removeFromList(listId: string) {
    setRemovingListId(listId);
    const res = await fetch(`/api/lists/${listId}/remove-members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: [target.id], dry_run: false }),
    });
    setRemovingListId(null);
    if (!res.ok) { toast.error("Failed to remove from list"); return; }
    setMemberLists((prev) => prev.filter((l) => l.id !== listId));
    toast.success("Removed from list");
  }

  // Open-core: Todos + Activity log (CRM) are premium (ee/). Hidden in the public build.
  const [hasPremium, setHasPremium] = useState(true);
  useEffect(() => {
    fetch("/api/premium-status").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHasPremium(!!d.hasPremium); }).catch(() => {});
  }, []);

  // Todos state
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);

  // Activity log state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(initialLogs);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  async function toggleTodo(todo: Todo) {
    const next = todo.status === "open" ? "done" : "open";
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) { toast.error("Failed to update"); return; }
    setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, status: next } : t));
  }

  async function deleteTodo(id: string) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  async function deleteLog(id: string) {
    const res = await fetch(`/api/activity-logs?id=${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    setActivityLogs((prev) => prev.filter((l) => l.id !== id));
  }

  async function saveEmail() {
    const trimmed = emailDraft.trim();
    const res = await fetch(`/api/targets/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });
    if (!res.ok) { toast.error("Failed to save email"); return; }
    setEmail(trimmed);
    setEditingEmail(false);
    toast.success("Email saved");
  }

  async function unsubscribeContact() {
    if (!confirm(`Unsubscribe ${target.full_name ?? "this contact"}? They'll stop receiving emails and newsletters, and can't be re-added to any email campaign.`)) return;
    setUnsubscribing(true);
    try {
      const res = await fetch(`/api/targets/${target.id}/unsubscribe`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to unsubscribe"); return; }
      setUnsubscribedAt(data.target?.unsubscribed_at ?? new Date().toISOString());
      toast.success("Unsubscribed — tracked on the Email page");
      // Track + surface the action: jump to the Email history page's Unsubscribed tab,
      // highlighting this contact's row.
      router.push(`/email?unsub=${target.id}`);
    } finally {
      setUnsubscribing(false);
    }
  }

  async function savePhone() {
    const trimmed = phoneDraft.trim();
    const res = await fetch(`/api/targets/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: trimmed }),
    });
    if (!res.ok) { toast.error("Failed to save phone"); return; }
    setPhone(trimmed);
    setEditingPhone(false);
    toast.success("Phone saved");
  }

  async function saveNotes() {
    const res = await fetch(`/api/targets/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesDraft }),
    });
    if (!res.ok) { toast.error("Failed to save notes"); return; }
    setNotes(notesDraft);
    setEditingNotes(false);
    toast.success("Notes saved");
  }

  const connectionStatus = target.degree === 1
    ? { label: "Connected", color: "bg-success/15 text-success" }
    : target.connection_requested_at
    ? { label: "Requested", color: "bg-warning/15 text-warning" }
    : { label: "Not connected", color: "bg-base-300 text-base-content/40" };

  return (
    <>
      <Head>
        <title>{target.full_name ?? "Contact"} — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {showTodoModal && (
        <TodoModal
          targetId={target.id}
          onClose={() => setShowTodoModal(false)}
          onSave={(todo) => { setTodos((prev) => [todo, ...prev]); setShowTodoModal(false); toast.success("Todo created"); }}
        />
      )}
      {selectedTodo && (
        <TodoDetailModal
          todo={selectedTodo}
          onClose={() => setSelectedTodo(null)}
          onSave={(updated) => { setTodos((prev) => prev.map((t) => t.id === updated.id ? updated : t)); setSelectedTodo(null); toast.success("Saved"); }}
        />
      )}
      {showLogModal && (
        <LogModal
          targetId={target.id}
          onClose={() => setShowLogModal(false)}
          onSave={(log) => { setActivityLogs((prev) => [log, ...prev]); setShowLogModal(false); }}
        />
      )}
      {selectedLog && (
        <LogDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onSave={(updated) => { setActivityLogs((prev) => prev.map((l) => l.id === updated.id ? updated : l)); setSelectedLog(null); toast.success("Saved"); }}
        />
      )}
      <div>
        {/* Back */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => history.back()} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-base-content/50 hover:text-base-content hover:bg-base-300/50 transition-colors">
            <RiArrowLeftLine size={16} />
          </button>
          <span className="text-base-content/40 text-sm">Contact</span>
        </div>

        {/* Header — full width */}
        <div className="bg-base-200 border border-base-300/50 rounded-xl p-5 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{target.full_name ?? "—"}</h1>
              {target.title && <p className="text-base-content/60 text-sm mt-0.5">{target.title}</p>}
              {target.headline && target.headline !== target.title && (
                <p className="text-base-content/40 text-xs mt-1 italic">{target.headline}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${connectionStatus.color}`}>
                  {target.degree === 1 ? <RiUserFollowLine size={11} /> : target.connection_requested_at ? <RiUserAddLine size={11} /> : null}
                  {connectionStatus.label}
                </span>
                {target.email && (
                  target.email_status === "invalid" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-error/15 text-error">
                      <RiCloseLine size={11} />
                      Email invalid
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success/15 text-success">
                      <RiCheckboxCircleLine size={11} />
                      {target.email_status === "verified" ? "Email verified" : "Email found"}
                    </span>
                  )
                )}
                {target.seniority && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-base-300 text-base-content/50 capitalize">
                    {target.seniority}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3">
                {target.linkedin_url && (
                  <a href={target.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-base-content/60 hover:text-primary transition-colors">
                    <RiLinkedinBoxLine size={14} /> LinkedIn
                  </a>
                )}
                {target.sales_nav_url && (
                  <a href={target.sales_nav_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-base-content/60 hover:text-primary transition-colors">
                    <RiExternalLinkLine size={14} /> Sales Navigator
                  </a>
                )}
                {target.companyObj && (
                  <Link href={`/companies/${target.companyObj.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-base-content/60 hover:text-primary transition-colors">
                    <RiBuilding2Line size={14} /> {target.companyObj.name}
                  </Link>
                )}
                {unsubscribedAt && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-error/80 px-2 py-0.5 rounded-md bg-error/10">
                    <RiForbid2Line size={13} />
                    Unsubscribed on {formatDate(unsubscribedAt)}
                  </div>
                )}
              </div>
            </div>
            {/* Quick Actions (only Email) */}
            <div className="flex items-center gap-2">
              <a
                href={`mailto:${email}`}
                onClick={(e) => {
                  if (!email) { e.preventDefault(); toast.error("No email address"); }
                  else if (unsubscribedAt) {
                    if (!confirm("This contact is unsubscribed. Are you sure you want to email them directly?")) e.preventDefault();
                  }
                }}
                className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-base-300/50 hover:bg-base-300 transition-colors ${!email ? "opacity-50 cursor-not-allowed" : ""}`}
                title={email ? "Send email" : "No email address"}
              >
                <RiMailLine size={15} />
              </a>
            </div>
          </div>
        </div>

        {/* 2-column layout */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* Left Column */}
          <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col gap-4">

            {/* Contact Details inline edit block */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Contact details</p>
              <div className="space-y-4">
                {/* Email */}
                <div>
                  <div className="flex items-center justify-between group">
                    <span className="text-xs text-base-content/50 flex items-center gap-1.5">
                      <RiMailLine size={13} /> Email address
                    </span>
                    {!editingEmail && (
                      <button onClick={() => { setEditingEmail(true); setTimeout(() => emailInputRef.current?.focus(), 0); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-primary p-0.5">
                        <RiEditLine size={12} />
                      </button>
                    )}
                  </div>
                  {editingEmail ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        ref={emailInputRef}
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEmail(); if (e.key === "Escape") setEditingEmail(false); }}
                        className="input input-bordered input-xs flex-1 bg-base-300/50 text-sm"
                        placeholder="john@example.com"
                      />
                      <button onClick={saveEmail} className="btn btn-ghost btn-xs text-success px-1"><RiCheckLine size={14} /></button>
                      <button onClick={() => setEditingEmail(false)} className="btn btn-ghost btn-xs text-base-content/40 px-1"><RiCloseLine size={14} /></button>
                    </div>
                  ) : (
                    <div className="text-sm mt-0.5 flex flex-wrap items-center gap-2">
                      {email ? (
                        <>
                          <span className={target.email_status === "invalid" ? "text-error line-through" : ""}>{email}</span>
                          {!unsubscribedAt && (
                            <button
                              type="button"
                              onClick={unsubscribeContact}
                              disabled={unsubscribing}
                              className="text-[10px] text-base-content/30 hover:text-error transition-colors uppercase tracking-wider font-medium ml-1"
                              title="Manually unsubscribe this contact"
                            >
                              Unsubscribe
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-base-content/30 italic">Unknown</span>
                      )}
                    </div>
                  )}
                </div>
                {/* Phone */}
                <div>
                  <div className="flex items-center justify-between group">
                    <span className="text-xs text-base-content/50 flex items-center gap-1.5">
                      <RiPhoneLine size={13} /> Phone
                    </span>
                    {!editingPhone && (
                      <button onClick={() => { setEditingPhone(true); setTimeout(() => phoneInputRef.current?.focus(), 0); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-primary p-0.5">
                        <RiEditLine size={12} />
                      </button>
                    )}
                  </div>
                  {editingPhone ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        ref={phoneInputRef}
                        type="tel"
                        value={phoneDraft}
                        onChange={(e) => setPhoneDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") savePhone(); if (e.key === "Escape") setEditingPhone(false); }}
                        className="input input-bordered input-xs flex-1 bg-base-300/50 text-sm"
                        placeholder="+1 555 123 4567"
                      />
                      <button onClick={savePhone} className="btn btn-ghost btn-xs text-success px-1"><RiCheckLine size={14} /></button>
                      <button onClick={() => setEditingPhone(false)} className="btn btn-ghost btn-xs text-base-content/40 px-1"><RiCloseLine size={14} /></button>
                    </div>
                  ) : (
                    <div className="text-sm mt-0.5 text-base-content/80">
                      {phone || <span className="text-base-content/30 italic">Unknown</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Info block */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Profile Info</p>
              <div className="space-y-4">
                <Field label="Location" value={target.location && <span className="flex items-center gap-1.5"><RiMapPinLine size={13} className="text-base-content/40 shrink-0" /> {target.location}</span>} />
                <Field label="Time in role" value={formatTenure(target.tenure_months)} />
                <Field label="Summary" value={target.summary && <div className="text-xs text-base-content/60 leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar whitespace-pre-line">{target.summary}</div>} />
              </div>
            </div>

            {/* Company Info block */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Company</p>
              {target.companyObj ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded bg-base-300 flex items-center justify-center shrink-0">
                      <RiBuilding2Line size={14} className="text-base-content/40" />
                    </span>
                    <div>
                      <div className="font-medium text-sm">{target.companyObj.name}</div>
                      {target.companyObj.domain && (
                        <a href={`https://${target.companyObj.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-base-content/50 hover:text-primary transition-colors flex items-center gap-1 mt-0.5">
                          <RiGlobalLine size={10} /> {target.companyObj.domain}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-base-content/60 space-y-1.5 pt-2 border-t border-base-300/50">
                    {target.companyObj.industry && <div className="flex items-center gap-1.5"><RiBriefcaseLine size={12} className="text-base-content/40 shrink-0" /> {target.companyObj.industry}</div>}
                    {target.companyObj.location && <div className="flex items-center gap-1.5"><RiMapPinLine size={12} className="text-base-content/40 shrink-0" /> {target.companyObj.location}</div>}
                    {target.company_size && <div className="flex items-center gap-1.5"><RiBriefcaseLine size={12} className="text-base-content/40 shrink-0" /> ~{target.company_size.toLocaleString()} employees</div>}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <RiBuilding2Line size={14} className="text-base-content/40" />
                    {target.company_name ?? <span className="text-base-content/30 italic">Unknown</span>}
                  </div>
                  {target.company_industry && <Field label="Industry" value={target.company_industry} />}
                  {target.company_size && <Field label="Size" value={`~${target.company_size.toLocaleString()} employees`} />}
                  <Field label="Description" value={target.company_description && <div className="text-xs text-base-content/60 leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar">{target.company_description}</div>} />
                </div>
              )}
            </div>

            {/* Lists block */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide">Lists</p>
                <button
                  onClick={() => setShowAddList(!showAddList)}
                  className="text-[10px] font-medium text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
                >
                  + Add
                </button>
              </div>

              {showAddList && (
                <div className="mb-3 flex items-center gap-2">
                  <select
                    className="select select-bordered select-xs flex-1 bg-base-300/50"
                    value={addListId}
                    onChange={(e) => setAddListId(e.target.value)}
                    disabled={addableLists.length === 0}
                  >
                    <option value="" disabled>
                      {addableLists.length === 0 ? "No other lists" : "Select list..."}
                    </option>
                    {addableLists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={addToList}
                    disabled={!addListId || addListLoading}
                    className="btn btn-primary btn-xs"
                  >
                    {addListLoading ? <span className="loading loading-spinner loading-xs" /> : "Save"}
                  </button>
                </div>
              )}

              {memberLists.length === 0 ? (
                <p className="text-xs text-base-content/40 italic">Not in any lists.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {memberLists.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs bg-base-300/50 text-base-content/70 border border-base-300 group">
                      <Link href={`/lists/${l.id}`} className="hover:text-primary transition-colors max-w-[150px] truncate">
                        {l.name}
                      </Link>
                      <button
                        onClick={() => removeFromList(l.id)}
                        disabled={removingListId === l.id}
                        className="text-base-content/30 hover:text-error hover:bg-error/10 p-0.5 rounded transition-colors"
                        title="Remove from list"
                      >
                        {removingListId === l.id ? <span className="loading loading-spinner loading-xs w-3 h-3" /> : <RiCloseLine size={12} />}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {hasPremium && (
              <>
                {/* Notes Block */}
                <div className="bg-base-200 border border-base-300/50 rounded-xl p-5 flex flex-col group">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide flex items-center gap-1.5">
                      <RiEditLine size={13} /> Notes
                    </p>
                    {!editingNotes && (
                      <button onClick={() => setEditingNotes(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-primary p-0.5">
                        <RiEditLine size={12} />
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        className="textarea textarea-bordered w-full bg-base-300/50 text-sm min-h-[100px] resize-y"
                        placeholder="Add notes..."
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setNotesDraft(notes); setEditingNotes(false); }} className="btn btn-ghost btn-xs text-base-content/50">Cancel</button>
                        <button onClick={saveNotes} className="btn btn-primary btn-xs">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`text-sm leading-relaxed whitespace-pre-line ${notes ? "text-base-content/80" : "text-base-content/30 italic"} min-h-[60px] cursor-text`}
                      onClick={() => setEditingNotes(true)}
                    >
                      {notes || "Click to add notes..."}
                    </div>
                  )}
                </div>

                {/* CRM: Todos & Activity Tabs */}
                <div className="bg-base-200 border border-base-300/50 rounded-xl flex flex-col">
                  {/* Fake tabs layout since we show both side by side or stacked */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-base-300/50">
                    {/* Todos Section */}
                    <div className="p-5 flex flex-col h-[400px]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <RiCheckboxCircleLine size={16} className="text-base-content/40" />
                          Todos
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-300 text-base-content/50 font-semibold">{todos.length}</span>
                        </h3>
                        <button onClick={() => setShowTodoModal(true)} className="w-6 h-6 flex items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          <RiAddLine size={14} />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {todos.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-sm text-base-content/30 italic">No todos yet.</div>
                        ) : (
                          todos.map((todo) => (
                            <div key={todo.id} className={`group relative p-3 rounded-xl border transition-colors ${todo.status === "done" ? "bg-base-300/30 border-base-300/50 opacity-60" : "bg-base-100 border-base-300/60 hover:border-base-300"}`}>
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => toggleTodo(todo)}
                                  className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${todo.status === "done" ? "bg-success/20 border-success/30 text-success" : "border-base-content/30 hover:border-primary text-transparent"}`}
                                >
                                  {todo.status === "done" && <RiCheckLine size={10} />}
                                </button>
                                <div className="flex-1 min-w-0" onClick={() => setSelectedTodo(todo)}>
                                  <div className="text-sm font-medium text-base-content truncate cursor-pointer hover:text-primary transition-colors">{todo.title}</div>
                                  {todo.due_date && (
                                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${todo.status === "open" && new Date(todo.due_date) < new Date() ? "text-error" : "text-base-content/40"}`}>
                                      <RiCalendarLine size={11} /> {formatDate(todo.due_date)}
                                    </div>
                                  )}
                                </div>
                                <button onClick={() => deleteTodo(todo.id)} className="opacity-0 group-hover:opacity-100 p-1 text-base-content/30 hover:text-error transition-all">
                                  <RiDeleteBinLine size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Activity Feed Section */}
                    <div className="p-5 flex flex-col h-[400px]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <RiTimeLine size={16} className="text-base-content/40" />
                          Activity
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-300 text-base-content/50 font-semibold">{activityLogs.length}</span>
                        </h3>
                        <button onClick={() => setShowLogModal(true)} className="w-6 h-6 flex items-center justify-center rounded-md bg-base-300 text-base-content/60 hover:text-base-content hover:bg-base-300/80 transition-colors">
                          <RiAddLine size={14} />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {activityLogs.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-sm text-base-content/30 italic">No activity logged.</div>
                        ) : (
                          <div className="relative pl-3 space-y-6 before:absolute before:inset-y-2 before:left-3 before:w-px before:bg-base-300/50">
                            {activityLogs.map((log) => (
                              <div key={log.id} className="relative pl-6 group">
                                <div className={`absolute left-0 top-1 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] ring-4 ring-base-200 ${LOG_TYPE_COLORS[log.type]}`}>
                                  {LOG_TYPE_ICONS[log.type]}
                                </div>
                                <div className="bg-base-100 border border-base-300/60 rounded-xl p-3 hover:border-base-300 transition-colors cursor-pointer" onClick={() => setSelectedLog(log)}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">{log.type}</span>
                                    <span className="text-[10px] text-base-content/30">{formatDate(log.logged_at)}</span>
                                  </div>
                                  <p className="text-sm text-base-content/80 whitespace-pre-wrap">{log.body}</p>
                                </div>
                                <button onClick={() => deleteLog(log.id)} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-base-200 border border-base-300 text-base-content/40 opacity-0 group-hover:opacity-100 hover:text-error hover:border-error/30 transition-all flex items-center justify-center">
                                  <RiCloseLine size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Campaign History */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5 flex-1 min-h-[300px]">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-4">Campaign History</p>
              {campaignHistory.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-base-300/50 flex items-center justify-center mb-3">
                    <RiFlowChart size={20} className="text-base-content/20" />
                  </div>
                  <p className="text-sm text-base-content/50">Not enrolled in any campaigns.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {campaignHistory.map((run) => (
                    <div key={run.run_id} className="bg-base-100 border border-base-300/50 rounded-xl overflow-hidden">
                      {/* Run header */}
                      <div className="px-4 py-3 border-b border-base-300/50 bg-base-300/20 flex items-center justify-between gap-4">
                        <div className="flex flex-col">
                          <Link href={`/workflows/${run.workflow_id}`} className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1.5">
                            <RiFlowChart size={14} className="text-base-content/40" /> {run.workflow_name}
                          </Link>
                          <span className="text-[10px] text-base-content/40 mt-0.5">Enrolled {formatDate(run.enrolled_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {run.state === "completed" && <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-success/10 text-success px-2 py-1 rounded border border-success/20"><RiCheckLine size={12} /> Completed</span>}
                          {run.state === "failed" && <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-error/10 text-error px-2 py-1 rounded border border-error/20"><RiCloseCircleLine size={12} /> Failed</span>}
                          {run.state === "in_progress" && <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-info/10 text-info px-2 py-1 rounded border border-info/20"><RiCheckboxBlankCircleLine size={10} className="animate-pulse" /> Step {run.current_step}</span>}
                          {run.state === "pending" && <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-base-300 text-base-content/50 px-2 py-1 rounded">Pending</span>}
                        </div>
                      </div>

                      {/* Error banner if failed */}
                      {run.error_message && (
                        <div className="px-4 py-2 bg-error/5 border-b border-error/10 text-xs text-error/80">
                          {run.error_message}
                        </div>
                      )}

                      {/* Execution Logs */}
                      <div className="p-4 bg-base-100 max-h-64 overflow-y-auto custom-scrollbar">
                        {run.logs.length === 0 ? (
                          <p className="text-xs text-base-content/30 italic">No execution logs yet.</p>
                        ) : (
                          <div className="space-y-3 relative before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-base-300/50 ml-1">
                            {run.logs.map((log) => {
                              const isError = log.level === "error";
                              return (
                                <div key={log.id} className="relative pl-6">
                                  <div className={`absolute left-0 top-1 -translate-x-1/2 w-[9px] h-[9px] rounded-full ring-4 ring-base-100 ${isError ? "bg-error" : "bg-base-300"}`} />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-base-content/30 font-mono mb-0.5">{new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                                    <span className={`text-xs ${isError ? "text-error" : "text-base-content/70"}`}>{log.message}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Extended Data block (Apollo, raw positions) */}
            {(functions.length > 0 || positions.length > 0) && (
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Enrichment Data</p>
                <div className="space-y-4">
                  {functions.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-base-content/40 font-medium mb-2">Functions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {functions.map((f, i) => (
                          <span key={i} className="px-2 py-0.5 rounded text-xs bg-base-300 text-base-content/60">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {positions.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-base-content/40 font-medium mb-2">Experience History</p>
                      <div className="space-y-3">
                        {positions.map((p, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="mt-0.5 shrink-0 w-6 h-6 rounded bg-base-300 flex items-center justify-center">
                              <RiBriefcaseLine size={12} className="text-base-content/40" />
                            </div>
                            <div>
                              <div className="text-sm font-medium">{p.title}</div>
                              <div className="text-xs text-base-content/60">{p.companyName}</div>
                              <div className="text-[10px] text-base-content/40 mt-0.5">
                                {p.startDate ? p.startDate.split("-").slice(0, 2).join("/") : "?"} — {p.current ? "Present" : p.endDate ? p.endDate.split("-").slice(0, 2).join("/") : "?"}
                              </div>
                              {p.description && <div className="text-xs text-base-content/50 mt-1 line-clamp-2">{p.description}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
