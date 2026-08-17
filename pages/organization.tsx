import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RiBuildingLine, RiUserAddLine, RiDeleteBinLine, RiVipCrownLine,
  RiShieldStarLine, RiKeyLine, RiFileCopyLine, RiRefreshLine,
  RiEditLine, RiDoorOpenLine, RiUserLine, RiArrowRightLine, RiSparklingLine,
} from "react-icons/ri";
import { useBillingStatus } from "@/components/billing/useBillingStatus";

type OrgMember = { user_id: string; email: string; name: string | null; role: string };
type OrgDetails = { id: string; name: string; invite_code?: string; plan: "free" | "paid"; owner_id: string; created_at: string };

export default function OrganizationPage() {
  const { status, refresh: refreshBilling } = useBillingStatus();
  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string; plan: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Edit org name
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Creation form
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  // Invite member
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const isSuperAdmin = Boolean(status?.isSuperAdmin);
  const currentUserRole = status?.orgRole ?? null;
  const currentUserId = status?.userId ?? "";
  const canManage = isSuperAdmin || currentUserRole === "owner" || currentUserRole === "admin";
  const isOwner = isSuperAdmin || currentUserRole === "owner";

  function load(targetId?: string) {
    setLoading(true);
    const url = targetId ? `/api/organizations?orgId=${targetId}` : "/api/organizations";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setOrg(d.organization ?? null);
        setMembers(d.members ?? []);
        if (d.allOrganizations) {
          setAllOrgs(d.allOrganizations);
        }
        if (d.organization) {
          setEditName(d.organization.name);
          setSelectedOrgId(d.organization.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // CRUD: Create Org
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create organization");
      toast.success("Organization initialized successfully!");
      setNewOrgName("");
      load(data.id);
      refreshBilling();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  // CRUD: Update Org Name
  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim() || !org) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update organization");
      toast.success("Organization name updated");
      setIsEditingName(false);
      load(org.id);
      refreshBilling();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setSavingName(false);
    }
  }

  // CRUD: Regenerate Invite Code
  async function handleRegenerateCode() {
    if (!org) return;
    if (!confirm("Regenerate invite code? The previous code will no longer work for new signups.")) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateInviteCode: true, orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to regenerate invite code");
      toast.success("New invite code generated!");
      load(org.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate invite code");
    } finally {
      setRegenerating(false);
    }
  }

  // CRUD: Add Member
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !org) return;
    setInviting(true);
    try {
      const res = await fetch("/api/organizations/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add member");
      toast.success("Member added successfully!");
      setInviteEmail("");
      load(org.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setInviting(false);
    }
  }

  // CRUD: Change Member Role
  async function handleChangeRole(userId: string, targetRole: "admin" | "member") {
    if (!org) return;
    try {
      const res = await fetch("/api/organizations/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: targetRole, orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update member role");
      toast.success(`Role updated to ${targetRole}`);
      load(org.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update member role");
    }
  }

  // CRUD: Remove Member
  async function handleRemoveMember(userId: string) {
    if (!org) return;
    if (!confirm("Remove this member from the organization?")) return;
    try {
      const res = await fetch("/api/organizations/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove member");
      toast.success("Member removed");
      load(org.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  // CRUD: Delete or Leave Org
  async function handleDeleteOrLeave() {
    if (!org) return;
    const actionLabel = isOwner ? "Delete Organization" : "Leave Organization";
    const confirmMsg = isOwner
      ? "Are you sure you want to permanently delete this organization? All members will be unlinked."
      : "Are you sure you want to leave this organization?";
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/organizations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${actionLabel} failed`);
      toast.success(isOwner ? "Organization deleted" : "You have left the organization");
      load();
      refreshBilling();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex items-center justify-center">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (!org) {
    return (
      <>
        <Head>
          <title>Organization Workspace — Linki</title>
        </Head>
        <div className="max-w-3xl mx-auto py-8 px-4">
          <div className="surface rounded-2xl p-8 border border-base-300 text-center space-y-5 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <RiBuildingLine size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-base-content">
                {isSuperAdmin ? "Initialize Platform Organization" : "Organization Not Initialized Yet"}
              </h2>
              <p className="text-xs sm:text-sm text-base-content/60 max-w-md mx-auto mt-1">
                {isSuperAdmin
                  ? "As Super Admin, create a company workspace to manage team members, invite codes, and permissions."
                  : "Initialize your organization workspace to start adding teammates, managing roles, and generating invite codes."}
              </p>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto pt-2">
              <input
                type="text"
                placeholder="e.g. Acme Sales Team"
                className="input input-sm flex-1"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
              />
              <button type="submit" disabled={creating} className="btn btn-sm btn-primary">
                {creating ? "Initializing…" : "Initialize Workspace"}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{org.name} · Organization Workspace</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-4 space-y-6">
        {/* Workspace Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-base-300">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-base-content flex items-center gap-2">
                <RiBuildingLine size={22} className="text-primary" /> {org.name}
              </h1>
              {canManage && !isEditingName && (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content"
                  title="Rename workspace"
                >
                  <RiEditLine size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-base-content/60 mt-0.5">
              Team Workspace · {members.length} Member{members.length === 1 ? "" : "s"} · Created {new Date(org.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Super Admin Org Switcher Dropdown */}
            {isSuperAdmin && allOrgs.length > 1 && (
              <select
                value={selectedOrgId}
                onChange={(e) => {
                  setSelectedOrgId(e.target.value);
                  load(e.target.value);
                }}
                className="select select-sm bg-base-100 border-base-300 text-xs font-semibold"
                title="Switch Organization"
              >
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    🏢 {o.name} ({o.plan === "paid" ? "Paid" : "Free"})
                  </option>
                ))}
              </select>
            )}

            <span className={`badge ${org.plan === "paid" ? "badge-primary" : "badge-ghost"}`}>
              {org.plan === "paid" ? "Paid Team Plan" : "Free Plan"}
            </span>

            {org.plan !== "paid" && (
              <Link href="/pricing" className="btn btn-xs btn-outline btn-primary">
                Upgrade Workspace
              </Link>
            )}
          </div>
        </div>

        {/* Inline Rename Form */}
        {isEditingName && (
          <div className="surface rounded-xl p-4 border border-primary/30 bg-base-100">
            <form onSubmit={handleUpdateName} className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                className="input input-sm flex-1"
                placeholder="Workspace name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
              <button type="submit" disabled={savingName} className="btn btn-xs btn-primary">
                {savingName ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setIsEditingName(false)} className="btn btn-xs btn-ghost">
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Team Registration & Invite Code Card */}
        {canManage && org.invite_code && (
          <div className="surface rounded-2xl p-5 sm:p-6 border border-primary/20 bg-primary/5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <RiKeyLine size={16} /> Team Registration Invite Code
                </h3>
                <p className="text-xs text-base-content/70 max-w-xl">
                  Share this code with teammates. When signing up on Linki, they can enter this code in the <strong>Invite Code</strong> field to automatically join <strong>{org.name}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold bg-base-100 border border-base-300 px-3.5 py-1.5 rounded-lg select-all text-base-content shadow-xs">
                  {org.invite_code}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (org.invite_code) {
                      navigator.clipboard.writeText(org.invite_code);
                      toast.success("Invite code copied to clipboard!");
                    }
                  }}
                  className="btn btn-sm btn-primary gap-1"
                  title="Copy code"
                >
                  <RiFileCopyLine size={14} /> Copy
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateCode}
                  disabled={regenerating}
                  className="btn btn-sm btn-ghost gap-1 text-base-content/60 hover:text-base-content"
                  title="Regenerate code"
                >
                  <RiRefreshLine size={14} className={regenerating ? "animate-spin" : ""} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Team Members List (CRUD) */}
        <div className="surface rounded-2xl p-5 sm:p-6 border border-base-300 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
              <RiUserLine size={16} className="text-base-content/60" /> Team Members ({members.length})
            </h3>
          </div>

          <div className="divide-y divide-base-300/40">
            {members.map((m) => {
              const isMemberOwner = m.role === "owner";
              const isMemberAdmin = m.role === "admin";
              const isSelf = m.user_id === currentUserId;

              return (
                <div key={m.user_id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {(m.name || m.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5 text-base-content">
                        {m.name || m.email}
                        {isSelf && <span className="text-[10px] text-base-content/40 font-normal">(You)</span>}
                      </p>
                      <p className="text-xs text-base-content/50 truncate">{m.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isMemberOwner && (
                      <span className="badge badge-sm gap-1 badge-primary">
                        <RiVipCrownLine size={11} /> Owner
                      </span>
                    )}

                    {isMemberAdmin && !isMemberOwner && (
                      <span className="badge badge-sm gap-1 badge-secondary">
                        <RiShieldStarLine size={11} /> Admin
                      </span>
                    )}

                    {!isMemberOwner && !isMemberAdmin && (
                      <span className="badge badge-sm badge-ghost">Member</span>
                    )}

                    {/* Role Actions */}
                    {canManage && !isMemberOwner && !isSelf && (
                      <div className="flex items-center gap-1">
                        {isMemberAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleChangeRole(m.user_id, "member")}
                            className="btn btn-ghost btn-xs text-xs text-base-content/60 hover:text-base-content"
                            title="Demote to Member"
                          >
                            Make Member
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleChangeRole(m.user_id, "admin")}
                            className="btn btn-ghost btn-xs text-xs text-primary hover:bg-primary/10"
                            title="Promote to Admin"
                          >
                            Make Admin
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.user_id)}
                          className="btn btn-ghost btn-xs text-error/70 hover:text-error"
                          title="Remove from organization"
                        >
                          <RiDeleteBinLine size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Member Form */}
          {canManage ? (
            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-base-300/40">
              <input
                type="email"
                className="input input-sm flex-1"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={inviting} className="btn btn-sm btn-primary gap-1.5">
                <RiUserAddLine size={14} /> {inviting ? "Adding…" : "Add Member"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-base-content/50 pt-3 border-t border-base-300/40">
              Only organization owners and admins can invite or modify member roles.
            </p>
          )}
        </div>

        {/* Danger Zone: Leave / Delete Organization */}
        <div className="surface rounded-2xl p-5 border border-error/20 bg-error/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-error">
                {isOwner ? "Delete Organization Workspace" : "Leave Organization"}
              </h4>
              <p className="text-xs text-base-content/60 mt-0.5">
                {isOwner
                  ? "Permanently delete this organization and unbind all team members."
                  : "Remove your account from this organization workspace."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeleteOrLeave}
              className="btn btn-sm btn-outline btn-error gap-1.5"
            >
              <RiDoorOpenLine size={14} /> {isOwner ? "Delete Workspace" : "Leave Workspace"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
