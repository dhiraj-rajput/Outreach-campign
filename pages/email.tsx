import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RiMailSendLine,
  RiEyeLine,
  RiForbidLine,
  RiNewspaperLine,
  RiFlowChart,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
} from "react-icons/ri";

interface Totals {
  campaign_emails_sent: number;
  campaign_opens: number;
  campaign_clicks: number;
  campaign_replies: number;
  newsletter_emails_sent: number;
  newsletter_opens: number;
  newsletter_clicks: number;
  unsubscribed_count: number;
}

interface CampaignRow {
  workflow_id: string;
  workflow_name: string;
  run_count: number;
  emails_sent: number;
  opened: number;
  clicked: number;
  replied: number;
  last_activity_at: string | null;
}

interface EditionRow {
  id: string;
  title: string;
  subject: string;
  status: string;
  sent_at: string | null;
  newsletter_name: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
}

interface ActivityRow {
  id: string;
  message?: string;
  created_at: string;
  full_name?: string | null;
  email?: string | null;
  company?: string | null;
  workflow_name?: string | null;
  newsletter_name?: string | null;
  edition_title?: string | null;
  target_id?: string;
  status?: string;
  source: "campaign" | "newsletter";
}

interface UnsubRow {
  id: string;
  email: string;
  reason: string;
  target_id: string | null;
  full_name: string | null;
  company: string | null;
  created_at: string;
}

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-base-200 border border-base-300/50 rounded-xl p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">{value.toLocaleString()}</p>
        <p className="text-[11px] text-base-content/40 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function EmailHistoryPage() {
  const router = useRouter();
  const highlight = (router.query.unsub as string) || null;

  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [editions, setEditions] = useState<EditionRow[]>([]);
  const [campaignActivity, setCampaignActivity] = useState<ActivityRow[]>([]);
  const [newsletterActivity, setNewsletterActivity] = useState<ActivityRow[]>([]);
  const [unsubscribed, setUnsubscribed] = useState<UnsubRow[]>([]);
  const [tab, setTab] = useState<"activity" | "unsubscribed">(highlight ? "unsubscribed" : "activity");

  useEffect(() => {
    fetch("/api/email/history")
      .then((r) => r.json())
      .then((d) => {
        setTotals(d.totals);
        setCampaigns(d.campaigns ?? []);
        setEditions(d.newsletterEditions ?? []);
        setCampaignActivity(d.campaignActivity ?? []);
        setNewsletterActivity(d.newsletterActivity ?? []);
        setUnsubscribed(d.unsubscribed ?? []);
      })
      .catch(() => toast.error("Failed to load email history"))
      .finally(() => setLoading(false));
  }, []);

  const activityFeed = [...campaignActivity, ...newsletterActivity]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  return (
    <>
      <Head>
        <title>Email — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-base-content flex items-center gap-2">
            <RiMailSendLine className="text-base-content/40" /> Email
          </h1>
          <p className="text-sm text-base-content/40 mt-0.5">
            Dedicated history of every email sent — cold campaigns and newsletters — plus who&apos;s unsubscribed.
          </p>
        </div>

        {loading || !totals ? (
          <div className="flex items-center justify-center py-24">
            <span className="loading loading-spinner loading-sm text-base-content/40" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Kpi label="Campaign emails sent" value={totals.campaign_emails_sent} icon={<RiFlowChart size={16} />} color="#f4b740" />
              <Kpi label="Newsletter emails sent" value={totals.newsletter_emails_sent} icon={<RiNewspaperLine size={16} />} color="#e879f9" />
              <Kpi label="Opens (campaigns)" value={totals.campaign_opens} icon={<RiEyeLine size={16} />} color="#38bdf8" />
              <Kpi label="Unsubscribed" value={totals.unsubscribed_count} icon={<RiForbidLine size={16} />} color="#f87171" />
            </div>

            {/* Campaign success table */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Campaign email performance</p>
              {campaigns.length === 0 ? (
                <p className="text-sm text-base-content/40">No campaign emails sent yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                      <th className="pb-2 font-medium">Campaign</th>
                      <th className="pb-2 font-medium">Sent</th>
                      <th className="pb-2 font-medium">Opened</th>
                      <th className="pb-2 font-medium">Clicked</th>
                      <th className="pb-2 font-medium">Replied</th>
                      <th className="pb-2 font-medium">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.workflow_id} className="border-t border-base-300/40">
                        <td className="py-2">
                          <Link href={`/workflows/${c.workflow_id}`} className="hover:text-primary transition-colors font-medium">
                            {c.workflow_name}
                          </Link>
                        </td>
                        <td className="py-2">{c.emails_sent}</td>
                        <td className="py-2 text-success">{c.opened} <span className="text-base-content/30">({c.emails_sent ? Math.round((c.opened / c.emails_sent) * 100) : 0}%)</span></td>
                        <td className="py-2 text-info">{c.clicked}</td>
                        <td className="py-2 text-primary">{c.replied}</td>
                        <td className="py-2 text-base-content/40">{fmt(c.last_activity_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Newsletter edition history */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Newsletter editions sent</p>
              {editions.length === 0 ? (
                <p className="text-sm text-base-content/40">No newsletter editions sent yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                      <th className="pb-2 font-medium">Edition</th>
                      <th className="pb-2 font-medium">Newsletter</th>
                      <th className="pb-2 font-medium">Sent</th>
                      <th className="pb-2 font-medium">Opened</th>
                      <th className="pb-2 font-medium">Clicked</th>
                      <th className="pb-2 font-medium">Failed</th>
                      <th className="pb-2 font-medium">Sent at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editions.map((e) => (
                      <tr key={e.id} className="border-t border-base-300/40">
                        <td className="py-2 font-medium">{e.title}</td>
                        <td className="py-2 text-base-content/60">{e.newsletter_name}</td>
                        <td className="py-2">{e.sent_count}/{e.total_recipients}</td>
                        <td className="py-2 text-success">{e.opened_count}</td>
                        <td className="py-2 text-info">{e.clicked_count}</td>
                        <td className="py-2 text-error">{e.failed_count || "—"}</td>
                        <td className="py-2 text-base-content/40">{fmt(e.sent_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Tabs: Activity / Unsubscribed */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <div className="flex items-center gap-1 mb-4 bg-base-300/50 rounded-lg p-0.5 w-fit">
                <button
                  onClick={() => setTab("activity")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "activity" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}
                >
                  Recent activity
                </button>
                <button
                  onClick={() => setTab("unsubscribed")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${tab === "unsubscribed" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}
                >
                  Unsubscribed <span className="text-error">({unsubscribed.length})</span>
                </button>
              </div>

              {tab === "activity" ? (
                activityFeed.length === 0 ? (
                  <p className="text-sm text-base-content/40">No email activity yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {activityFeed.map((a) => (
                      <li key={`${a.source}-${a.id}`} className="flex items-center gap-3 text-sm py-1.5 border-b border-base-300/30 last:border-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.source === "campaign" ? "bg-warning" : "bg-secondary"}`} />
                        <span className="flex-1 min-w-0 truncate">
                          {a.source === "campaign" ? (
                            <>
                              Email sent to <span className="font-medium">{a.full_name ?? "contact"}</span>
                              {a.company ? <span className="text-base-content/40"> at {a.company}</span> : null}
                              {a.workflow_name ? <span className="text-base-content/40"> — {a.workflow_name}</span> : null}
                            </>
                          ) : (
                            <>
                              &quot;{a.edition_title}&quot; sent to <span className="font-medium">{a.full_name ?? a.email}</span>
                              <span className="text-base-content/40"> — {a.newsletter_name}</span>
                              {a.status === "failed" && <span className="text-error ml-1">(failed)</span>}
                            </>
                          )}
                        </span>
                        <span className="text-base-content/30 text-xs shrink-0">{fmt(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : unsubscribed.length === 0 ? (
                <p className="text-sm text-base-content/40">Nobody has unsubscribed yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                      <th className="pb-2 font-medium">Person</th>
                      <th className="pb-2 font-medium">Email</th>
                      <th className="pb-2 font-medium">Reason</th>
                      <th className="pb-2 font-medium">Unsubscribed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unsubscribed.map((u) => (
                      <tr
                        key={u.id}
                        className={`border-t border-base-300/40 ${highlight && u.target_id === highlight ? "bg-error/5" : ""}`}
                      >
                        <td className="py-2">
                          {u.target_id ? (
                            <Link href={`/contacts/${u.target_id}`} className="hover:text-primary transition-colors font-medium">
                              {u.full_name ?? "—"}
                            </Link>
                          ) : (
                            <span className="text-base-content/50">{u.full_name ?? "—"}</span>
                          )}
                          {u.company && <span className="text-base-content/40"> · {u.company}</span>}
                        </td>
                        <td className="py-2 text-base-content/60">{u.email}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-error/10 text-error">
                            <RiCloseCircleLine size={11} /> {u.reason.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2 text-base-content/40">{fmt(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[11px] text-base-content/30 mt-4 flex items-center gap-1.5">
                <RiCheckboxCircleLine size={12} /> Unsubscribed contacts are automatically blocked from being re-added to campaigns or newsletters.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
