import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RiAddLine, RiDeleteBinLine } from "react-icons/ri";
import PageHeader from "@/components/ui/PageHeader";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import { useBillingStatus } from "@/components/billing/useBillingStatus";

type Deal = {
  id: string;
  title: string;
  value: number;
  currency: string;
  stage: string;
  notes: string | null;
  contact_name: string | null;
  company_name: string | null;
};

const STAGES: { id: string; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export default function PipelinePage() {
  const { status, loading: statusLoading } = useBillingStatus();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const isPaid = status?.isPaid ?? false;

  function load() {
    if (!isPaid) { setLoading(false); return; }
    setLoading(true);
    fetch("/api/pipeline/deals")
      .then((r) => (r.ok ? r.json() : { deals: [] }))
      .then((d) => setDeals(d.deals ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, [isPaid]);

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of STAGES) map[s.id] = [];
    for (const d of deals) (map[d.stage] ?? (map[d.stage] = [])).push(d);
    return map;
  }, [deals]);

  const totalValue = useMemo(
    () => deals.filter((d) => d.stage !== "lost").reduce((sum, d) => sum + (d.value || 0), 0),
    [deals]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/pipeline/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), value: value ? Number(value) : 0 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to create deal");
      setDeals((prev) => [d.deal, ...prev]);
      setTitle("");
      setValue("");
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSaving(false);
    }
  }

  async function moveDeal(id: string, stage: string) {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    try {
      const r = await fetch(`/api/pipeline/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move deal");
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this deal?")) return;
    setDeals((prev) => prev.filter((d) => d.id !== id));
    try {
      await fetch(`/api/pipeline/deals/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  }

  if (statusLoading) {
    return <div className="p-6"><span className="loading loading-spinner loading-sm" /></div>;
  }

  return (
    <>
      <Head><title>Pipeline · Linki</title></Head>
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Pipeline"
          subtitle={isPaid ? `${deals.length} deals · $${totalValue.toLocaleString()} open value` : "CRM deal pipeline"}
          actions={
            isPaid ? (
              <button type="button" onClick={() => setShowForm((s) => !s)} className="btn btn-primary btn-sm gap-1.5">
                <RiAddLine size={15} /> New deal
              </button>
            ) : undefined
          }
        />

        {!isPaid && <UpgradeBanner message="The CRM deal pipeline is a paid feature. Upgrade to start tracking deals through your funnel." />}

        {isPaid && showForm && (
          <form onSubmit={handleCreate} className="surface rounded-xl p-4 mb-4 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="label-text text-xs">Title</label>
              <input
                type="text"
                className="input input-sm input-bordered w-full"
                placeholder="Acme Corp — annual contract"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="w-32">
              <label className="label-text text-xs">Value ($)</label>
              <input
                type="number"
                className="input input-sm input-bordered w-full"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
              {saving ? "Adding…" : "Add deal"}
            </button>
          </form>
        )}

        {isPaid && (
          <div className={`grid grid-flow-col auto-cols-[260px] gap-3 overflow-x-auto pb-2 ${loading ? "opacity-50" : ""}`}>
            {STAGES.map((stage) => (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && moveDeal(dragId, stage.id)}
                className="surface rounded-xl p-2.5 flex flex-col min-h-[200px]"
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/60">{stage.label}</h3>
                  <span className="text-xs text-base-content/40">{byStage[stage.id]?.length ?? 0}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {byStage[stage.id]?.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => setDragId(deal.id)}
                      onDragEnd={() => setDragId(null)}
                      className="group bg-base-100 border border-base-300/50 rounded-lg p-2.5 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium leading-tight">{deal.title}</p>
                        <button
                          type="button"
                          onClick={() => handleDelete(deal.id)}
                          className="opacity-0 group-hover:opacity-100 text-base-content/40 hover:text-error transition-opacity shrink-0"
                        >
                          <RiDeleteBinLine size={13} />
                        </button>
                      </div>
                      {(deal.contact_name || deal.company_name) && (
                        <p className="text-xs text-base-content/50 mt-1 truncate">
                          {[deal.contact_name, deal.company_name].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {deal.value > 0 && (
                        <p className="text-xs font-medium text-accent mt-1.5">${deal.value.toLocaleString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
