import Head from "next/head";
import { useEffect, useState } from "react";
import { GetServerSideProps } from "next";
import { toast } from "sonner";
import { RiShieldStarLine, RiVipCrownLine } from "react-icons/ri";
import PageHeader from "@/components/ui/PageHeader";
import { getAccessContext } from "@/lib/access";

type AdminUser = {
  id: string; email: string; name: string | null; role: string; plan: string;
  org_id: string | null; org_name: string | null; created_at: string;
};
type AdminOrg = {
  id: string; name: string; plan: string; owner_email: string; member_count: number; created_at: string;
};

export const getServerSideProps: GetServerSideProps = async () => {
  return { notFound: true };
};

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "orgs">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/organizations").then((r) => r.json()),
    ])
      .then(([u, o]) => {
        setUsers(u.users ?? []);
        setOrgs(o.organizations ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function togglePlan(userId: string, current: string) {
    const plan = current === "paid" ? "free" : "paid";
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function toggleRole(userId: string, current: string) {
    const role = current === "super_admin" ? "user" : "super_admin";
    if (role === "user" && !confirm("Remove super admin access from this user?")) return;
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function toggleOrgPlan(orgId: string, current: string) {
    const plan = current === "paid" ? "free" : "paid";
    try {
      const r = await fetch("/api/admin/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, plan }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  const paidUsers = users.filter((u) => u.plan === "paid").length;
  const paidOrgs = orgs.filter((o) => o.plan === "paid").length;

  return (
    <>
      <Head><title>Admin · Linki</title></Head>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PageHeader
          title="Super Admin"
          subtitle="Manage every user and organization's plan and access."
          actions={
            <span className="badge badge-primary gap-1"><RiShieldStarLine size={12} /> Super admin</span>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Users" value={users.length} />
          <StatCard label="Paid users" value={paidUsers} />
          <StatCard label="Organizations" value={orgs.length} />
          <StatCard label="Paid orgs" value={paidOrgs} />
        </div>

        <div role="tablist" className="tabs tabs-boxed mb-4 max-w-xs">
          <button role="tab" className={`tab ${tab === "users" ? "tab-active" : ""}`} onClick={() => setTab("users")}>
            Users
          </button>
          <button role="tab" className={`tab ${tab === "orgs" ? "tab-active" : ""}`} onClick={() => setTab("orgs")}>
            Organizations
          </button>
        </div>

        {loading ? (
          <span className="loading loading-spinner loading-sm" />
        ) : tab === "users" ? (
          <div className="surface rounded-xl overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="text-sm">{u.name || u.email}</div>
                      <div className="text-xs text-base-content/50">{u.email}</div>
                    </td>
                    <td className="text-sm text-base-content/70">{u.org_name || "—"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => togglePlan(u.id, u.plan)}
                        className={`badge cursor-pointer ${u.plan === "paid" ? "badge-primary" : "badge-ghost"}`}
                      >
                        {u.plan === "paid" ? "Paid" : "Free"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleRole(u.id, u.role)}
                        className={`badge cursor-pointer gap-1 ${u.role === "super_admin" ? "badge-secondary" : "badge-ghost"}`}
                      >
                        {u.role === "super_admin" && <RiVipCrownLine size={11} />}
                        {u.role === "super_admin" ? "Super admin" : "User"}
                      </button>
                    </td>
                    <td className="text-xs text-base-content/50">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="surface rounded-xl overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Owner</th>
                  <th>Members</th>
                  <th>Plan</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td className="text-sm">{o.name}</td>
                    <td className="text-sm text-base-content/70">{o.owner_email}</td>
                    <td className="text-sm text-base-content/70">{o.member_count}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleOrgPlan(o.id, o.plan)}
                        className={`badge cursor-pointer ${o.plan === "paid" ? "badge-primary" : "badge-ghost"}`}
                      >
                        {o.plan === "paid" ? "Paid" : "Free"}
                      </button>
                    </td>
                    <td className="text-xs text-base-content/50">{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface rounded-lg p-3.5">
      <p className="text-xs text-base-content/50">{label}</p>
      <p className="text-xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}
