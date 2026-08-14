import Head from "next/head";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RiBuildingLine, RiUserAddLine, RiDeleteBinLine, RiVipCrownLine } from "react-icons/ri";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

type Member = { user_id: string; email: string; name: string | null; role: string };
type Org = { id: string; name: string; plan: "free" | "paid" };

export default function OrganizationPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((d) => {
        setOrg(d.organization ?? null);
        setMembers(d.members ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to create organization");
      toast.success("Organization created!");
      setNewOrgName("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const r = await fetch("/api/organizations/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to add member");
      toast.success("Member added!");
      setInviteEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from your organization?")) return;
    try {
      const r = await fetch("/api/organizations/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to remove member");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  if (loading) {
    return <div className="p-6"><span className="loading loading-spinner loading-sm" /></div>;
  }

  return (
    <>
      <Head><title>Organization · Linki</title></Head>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <PageHeader title="Organization" subtitle="Share a paid plan with your whole team." />

        {!org ? (
          <EmptyState
            icon={<RiBuildingLine size={22} />}
            title="You're not part of an organization yet"
            description="Create one to share a paid plan and manage members together."
            action={
              <form onSubmit={handleCreate} className="flex gap-2 max-w-sm mx-auto">
                <input
                  type="text"
                  className="input input-sm input-bordered flex-1"
                  placeholder="Organization name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
                <button type="submit" disabled={creating} className="btn btn-primary btn-sm">
                  {creating ? "Creating…" : "Create"}
                </button>
              </form>
            }
          />
        ) : (
          <div className="space-y-5">
            <div className="surface rounded-xl p-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <RiBuildingLine size={16} /> {org.name}
                </h2>
                <p className="text-xs text-base-content/50 mt-1">{members.length} member{members.length === 1 ? "" : "s"}</p>
              </div>
              <span className={`badge ${org.plan === "paid" ? "badge-primary" : "badge-ghost"}`}>
                {org.plan === "paid" ? "Paid" : "Free"}
              </span>
            </div>

            <div className="surface rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-3">Members</h3>
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{m.name || m.email}</p>
                      <p className="text-xs text-base-content/50 truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.role === "owner" && (
                        <span className="badge badge-sm gap-1"><RiVipCrownLine size={11} /> Owner</span>
                      )}
                      {m.role !== "owner" && (
                        <button
                          type="button"
                          onClick={() => handleRemove(m.user_id)}
                          className="btn btn-ghost btn-xs text-error/70 hover:text-error"
                        >
                          <RiDeleteBinLine size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleInvite} className="flex gap-2 mt-4 pt-4 border-t border-base-300/40">
                <input
                  type="email"
                  className="input input-sm input-bordered flex-1"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <button type="submit" disabled={inviting} className="btn btn-sm gap-1.5">
                  <RiUserAddLine size={14} /> {inviting ? "Adding…" : "Add"}
                </button>
              </form>
              <p className="text-xs text-base-content/40 mt-2">
                The person must already have a Linki account with that email.
              </p>
            </div>

            {org.plan !== "paid" && (
              <p className="text-sm text-center text-base-content/60">
                <a href="/pricing" className="link link-primary">Upgrade this organization</a> to give every member paid access.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
