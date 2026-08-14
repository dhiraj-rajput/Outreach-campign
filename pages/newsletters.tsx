import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import {
  RiNewspaperLine,
  RiAddLine,
  RiUserAddLine,
  RiSendPlaneLine,
  RiCloseLine,
  RiLoader4Line,
  RiTeamLine,
  RiDraftLine,
  RiMagicLine,
  RiImageAddLine,
  RiEyeLine,
  RiLockLine,
} from "react-icons/ri";
import { useBillingStatus } from "@/components/billing/useBillingStatus";

interface Newsletter {
  id: string;
  name: string;
  description: string | null;
  sender_name: string | null;
  sender_email: string;
  subscriber_count: number;
  edition_count: number;
  created_at: string;
}

interface Subscriber {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  subscribed_at: string;
}

interface Edition {
  id: string;
  title: string;
  subject: string;
  content_html: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface EmailAccount {
  id: string;
  name: string;
  from_email: string;
  from_name: string | null;
}

interface DBList {
  id: string;
  name: string;
  target_count: number;
}

export default function NewslettersPage() {
  const router = useRouter();
  const { status: billingStatus } = useBillingStatus();
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);

  // Connected accounts & lists
  const [connectedEmails, setConnectedEmails] = useState<EmailAccount[]>([]);
  const [dbLists, setDbLists] = useState<DBList[]>([]);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showEditionModal, setShowEditionModal] = useState(false);
  const [previewEdition, setPreviewEdition] = useState<{ title: string; subject: string; content_html: string } | null>(null);

  // Subscribers & Editions for selected newsletter
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [tab, setTab] = useState<"editions" | "subscribers">("editions");

  // Newsletter Create form states
  const [newNewsName, setNewNewsName] = useState("");
  const [newNewsDesc, setNewNewsDesc] = useState("");
  const [selectedEmailAccount, setSelectedEmailAccount] = useState<string>("");
  const [savingNews, setSavingNews] = useState(false);

  // Subscriber form (Single or List import)
  const [subMode, setSubMode] = useState<"single" | "list">("list");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [subEmail, setSubEmail] = useState("");
  const [subName, setSubName] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  // Edition form, Banner & AI state
  const [edTitle, setEdTitle] = useState("");
  const [edSubject, setEdSubject] = useState("");
  const [edContent, setEdContent] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [savingEd, setSavingEd] = useState(false);
  const [sendingEditionId, setSendingEditionId] = useState<string | null>(null);

  function loadNewsletters() {
    setLoading(true);
    fetch("/api/newsletters")
      .then((r) => r.json())
      .then((d) => {
        const list = d.newsletters ?? [];
        setNewsletters(list);
        if (list.length > 0 && !selectedNewsletter) {
          setSelectedNewsletter(list[0]);
        }
      })
      .catch(() => toast.error("Failed to load newsletters"))
      .finally(() => setLoading(false));
  }

  function loadConnectedData() {
    fetch("/api/email-accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EmailAccount[]) => {
        setConnectedEmails(data);
        if (data.length > 0) setSelectedEmailAccount(data[0].from_email);
      })
      .catch(() => {});

    fetch("/api/lists")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DBList[]) => {
        setDbLists(data);
        if (data.length > 0) setSelectedListId(data[0].id);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadNewsletters();
    loadConnectedData();
  }, []);

  useEffect(() => {
    if (!selectedNewsletter) return;
    fetch(`/api/newsletters/${selectedNewsletter.id}/subscribers`)
      .then((r) => r.json())
      .then((d) => setSubscribers(d.subscribers ?? []))
      .catch(() => {});

    fetch(`/api/newsletters/${selectedNewsletter.id}/editions`)
      .then((r) => r.json())
      .then((d) => setEditions(d.editions ?? []))
      .catch(() => {});
  }, [selectedNewsletter]);

  async function handleCreateNewsletter(e: React.FormEvent) {
    e.preventDefault();
    if (!newNewsName.trim()) return;

    const emailToUse = selectedEmailAccount.trim();
    if (!emailToUse) {
      toast.error("Please connect an email account in Settings → Email first");
      return;
    }

    const matchingAccount = connectedEmails.find((a) => a.from_email === emailToUse);
    const senderName = matchingAccount?.from_name || matchingAccount?.name || "Newsletter Sender";

    setSavingNews(true);
    try {
      const r = await fetch("/api/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newNewsName,
          description: newNewsDesc,
          sender_name: senderName,
          sender_email: emailToUse,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to create newsletter");
      toast.success("Newsletter created!");
      setShowCreateModal(false);
      setNewNewsName("");
      setNewNewsDesc("");
      loadNewsletters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating newsletter");
    } finally {
      setSavingNews(false);
    }
  }

  async function handleAddSubscriber(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNewsletter) return;
    setAddingSub(true);

    try {
      let r: Response;
      if (subMode === "list") {
        if (!selectedListId) throw new Error("Please select a database list");
        r = await fetch(`/api/newsletters/${selectedNewsletter.id}/subscribers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ list_id: selectedListId }),
        });
      } else {
        if (!subEmail.trim()) throw new Error("Valid email required");
        r = await fetch(`/api/newsletters/${selectedNewsletter.id}/subscribers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: subEmail, full_name: subName }),
        });
      }

      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to add subscribers");
      toast.success(subMode === "list" ? `Imported ${d.added} contacts from list` : "Subscriber added!");
      setSubEmail("");
      setSubName("");
      setShowSubModal(false);

      fetch(`/api/newsletters/${selectedNewsletter.id}/subscribers`)
        .then((res) => res.json())
        .then((data) => setSubscribers(data.subscribers ?? []));
      loadNewsletters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error adding subscriber");
    } finally {
      setAddingSub(false);
    }
  }

  async function handleImageUpload(file: File) {
    setUploadingBanner(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await fetch("/api/newsletters/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Image upload failed");

        setBannerUrl(data.url);
        toast.success("Banner image uploaded!");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload banner image");
    } finally {
      setUploadingBanner(false);
    }
  }

  async function handleGenerateAIContent() {
    if (!edTitle.trim()) {
      toast.error("Please enter an issue title first");
      return;
    }
    if (!billingStatus?.isPaid) {
      toast.error("AI newsletter generation is a paid feature");
      router.push("/pricing");
      return;
    }
    setAiGenerating(true);
    try {
      const r = await fetch("/api/newsletters/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: edTitle, prompt: edContent, bannerUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "AI generation failed");

      if (d.subject) setEdSubject(d.subject);
      if (d.content_html) setEdContent(d.content_html);
      toast.success("AI generated newsletter content with banner!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleCreateEdition(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNewsletter || !edTitle.trim() || !edSubject.trim() || !edContent.trim()) return;
    setSavingEd(true);
    try {
      let finalHtml = edContent.trim();
      if (bannerUrl && bannerUrl.trim() && !finalHtml.includes(bannerUrl.trim())) {
        const bannerHtml = `<div style="text-align: center; margin-bottom: 24px;"><img src="${bannerUrl.trim()}" alt="Banner" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; display: block; margin: 0 auto;" /></div>`;
        finalHtml = `${bannerHtml}\n${finalHtml}`;
      }

      const r = await fetch(`/api/newsletters/${selectedNewsletter.id}/editions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: edTitle,
          subject: edSubject,
          content_html: finalHtml,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to create edition");
      toast.success("Edition saved as draft!");
      setEdTitle("");
      setEdSubject("");
      setEdContent("");
      setBannerUrl("");
      setShowEditionModal(false);

      fetch(`/api/newsletters/${selectedNewsletter.id}/editions`)
        .then((res) => res.json())
        .then((data) => setEditions(data.editions ?? []));
      loadNewsletters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating edition");
    } finally {
      setSavingEd(false);
    }
  }

  async function handleSendEdition(editionId: string) {
    if (!selectedNewsletter) return;
    setSendingEditionId(editionId);
    try {
      const r = await fetch(`/api/newsletters/${selectedNewsletter.id}/editions/${editionId}/send`, {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to send newsletter issue");

      toast.success(d.message ?? `Issue mailed to ${d.sent_count} subscribers!`);

      fetch(`/api/newsletters/${selectedNewsletter.id}/editions`)
        .then((res) => res.json())
        .then((data) => setEditions(data.editions ?? []));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error sending issue");
    } finally {
      setSendingEditionId(null);
    }
  }

  return (
    <>
      <Head>
        <title>Newsletters Dashboard — Linki</title>
      </Head>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <RiNewspaperLine className="text-secondary" /> Newsletters Dashboard
          </h1>
          <p className="text-base-content/40 text-sm mt-0.5">
            View subscriber lists, track issues, and manage email newsletters
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 h-10 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
        >
          <RiAddLine size={16} /> New Newsletter
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 text-base-content/30 py-24">
          <span className="loading loading-spinner loading-md" />
          <span className="text-sm">Loading newsletters…</span>
        </div>
      ) : newsletters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-base-content/30 py-24 border border-dashed border-base-300/60 rounded-xl">
          <RiNewspaperLine size={40} className="opacity-30" />
          <div className="text-center">
            <p className="text-sm font-medium">No newsletters created yet</p>
            <p className="text-xs mt-1 text-base-content/40">
              Create your first newsletter using your connected email accounts & DB lists
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
          >
            <RiAddLine size={16} /> Create Newsletter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          {/* Newsletter sidebar list */}
          <div className="md:col-span-1 space-y-2">
            <div className="text-xs font-semibold text-base-content/40 uppercase tracking-wider px-1 mb-2">
              Your Newsletters ({newsletters.length})
            </div>
            {newsletters.map((n) => {
              const active = selectedNewsletter?.id === n.id;
              return (
                <div
                  key={n.id}
                  onClick={() => setSelectedNewsletter(n)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-base-200/50 border-base-300/40 hover:bg-base-200 text-base-content"
                  }`}
                >
                  <div className="font-semibold text-sm truncate">{n.name}</div>
                  <div className="text-xs text-base-content/50 truncate mt-0.5">
                    {n.sender_email}
                  </div>
                  <div className="flex items-center gap-3 mt-2.5 text-xs text-base-content/40">
                    <span className="inline-flex items-center gap-1">
                      <RiTeamLine size={12} /> {n.subscriber_count} subs
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <RiDraftLine size={12} /> {n.edition_count} issues
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Newsletter Main View */}
          {selectedNewsletter && (
            <div className="md:col-span-3 space-y-4">
              {/* Analytics KPI summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 kpi-strip">
                <div className="bg-base-200 border border-base-300/50 rounded-xl p-3.5">
                  <div className="text-xs font-medium text-base-content/40 uppercase tracking-wider">Subscribers</div>
                  <div className="text-xl font-bold text-base-content mt-1">{selectedNewsletter.subscriber_count}</div>
                  <div className="text-[11px] text-success mt-0.5">Active recipients</div>
                </div>
                <div className="bg-base-200 border border-base-300/50 rounded-xl p-3.5">
                  <div className="text-xs font-medium text-base-content/40 uppercase tracking-wider">Issues Composed</div>
                  <div className="text-xl font-bold text-base-content mt-1">{selectedNewsletter.edition_count}</div>
                  <div className="text-[11px] text-base-content/50 mt-0.5">{editions.filter(e => e.status === "sent").length} dispatched</div>
                </div>
                <div className="bg-base-200 border border-base-300/50 rounded-xl p-3.5">
                  <div className="text-xs font-medium text-base-content/40 uppercase tracking-wider">Sender Channel</div>
                  <div className="text-sm font-semibold text-primary truncate mt-1">{selectedNewsletter.sender_email}</div>
                  <div className="text-[11px] text-base-content/50 mt-0.5">{selectedNewsletter.sender_name || "Connected Account"}</div>
                </div>
              </div>

              {/* Active Newsletter Banner */}
              <div className="bg-base-200/60 border border-base-300/50 rounded-xl p-3 sm:p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-base">{selectedNewsletter.name}</h2>
                  {selectedNewsletter.description && (
                    <p className="text-xs text-base-content/50 mt-0.5">
                      {selectedNewsletter.description}
                    </p>
                  )}
                  <div className="text-xs text-base-content/40 mt-1">
                    Sender: {selectedNewsletter.sender_name ?? "—"} ({selectedNewsletter.sender_email})
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowSubModal(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 h-9 rounded-lg text-xs font-medium bg-base-300/60 text-base-content/80 hover:bg-base-300 transition-colors"
                  >
                    <RiUserAddLine size={14} /> Add / Import Subscribers
                  </button>
                  <button
                    onClick={() => setShowEditionModal(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 h-9 rounded-lg text-xs font-medium bg-secondary text-secondary-content hover:bg-secondary/90 transition-colors"
                  >
                    <RiAddLine size={14} /> Compose Issue
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="tab-nav flex items-center gap-2 border-b border-base-300/50 pb-2 overflow-x-auto">
                <button
                  onClick={() => setTab("editions")}
                  className={`px-3 py-1.5 h-9 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === "editions"
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-base-content/50 hover:bg-base-300/40"
                  }`}
                >
                  Issues ({editions.length})
                </button>
                <button
                  onClick={() => setTab("subscribers")}
                  className={`px-3 py-1.5 h-9 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === "subscribers"
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-base-content/50 hover:bg-base-300/40"
                  }`}
                >
                  Subscribers ({subscribers.length})
                </button>
              </div>

              {/* Tab Content: Editions */}
              {tab === "editions" && (
                <div>
                  {editions.length === 0 ? (
                    <div className="text-center text-base-content/30 text-sm py-12 border border-dashed border-base-300/50 rounded-xl">
                      No issues composed for this newsletter yet.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {editions.map((ed) => (
                        <div
                          key={ed.id}
                          className="bg-base-200/40 border border-base-300/40 rounded-xl p-3 sm:p-4 flex flex-wrap items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-sm">{ed.title}</span>
                              <span
                                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  ed.status === "sent"
                                    ? "bg-success/15 text-success"
                                    : "bg-warning/15 text-warning"
                                }`}
                              >
                                {ed.status}
                              </span>
                            </div>
                            <div className="text-xs text-base-content/50 mt-1">
                              Subject: {ed.subject}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => setPreviewEdition(ed)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 h-9 rounded-lg text-xs font-medium bg-base-300/60 text-base-content hover:bg-base-300 transition-colors"
                            >
                              <RiEyeLine size={13} /> Preview
                            </button>
                            <button
                              onClick={() => handleSendEdition(ed.id)}
                              disabled={sendingEditionId === ed.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 h-9 rounded-lg text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 disabled:opacity-40 transition-colors"
                            >
                              {sendingEditionId === ed.id ? (
                                <RiLoader4Line size={13} className="animate-spin" />
                              ) : (
                                <RiSendPlaneLine size={13} />
                              )}
                              {sendingEditionId === ed.id ? "Mailing…" : ed.status === "sent" ? "Resend Issue" : "Mail Issue"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Subscribers */}
              {tab === "subscribers" && (
                <div>
                  {subscribers.length === 0 ? (
                    <div className="text-center text-base-content/30 text-sm py-12 border border-dashed border-base-300/50 rounded-xl">
                      No subscribers added yet.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-base-300/50 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-base-200/60 border-b border-base-300/50 text-base-content/40">
                            <th className="text-left px-4 py-2">Email</th>
                            <th className="text-left px-4 py-2 hidden sm:table-cell">Name</th>
                            <th className="text-left px-4 py-2">Status</th>
                            <th className="text-right px-4 py-2 hidden sm:table-cell">Subscribed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subscribers.map((s) => (
                            <tr key={s.id} className="border-b border-base-300/30">
                              <td className="px-4 py-2.5 font-medium">{s.email}</td>
                              <td className="px-4 py-2.5 text-base-content/60 hidden sm:table-cell">
                                {s.full_name ?? "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-base-content/40 hidden sm:table-cell">
                                {new Date(s.subscribed_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Create Newsletter */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-base-100 border border-base-300/50 rounded-xl p-5 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">New Newsletter</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-base-content/40 hover:text-base-content">
                <RiCloseLine size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateNewsletter} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-base-content/70">Newsletter Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Founder Digest"
                  value={newNewsName}
                  onChange={(e) => setNewNewsName(e.target.value)}
                  className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-base-content/70">Description</label>
                <input
                  type="text"
                  placeholder="Weekly insights on tech & growth"
                  value={newNewsDesc}
                  onChange={(e) => setNewNewsDesc(e.target.value)}
                  className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-base-content/70">Select Connected Sender Email</label>
                {connectedEmails.length === 0 ? (
                  <div className="text-xs text-warning mt-1">
                    No connected email accounts found. Please configure an account in Settings → Email.
                  </div>
                ) : (
                  <select
                    value={selectedEmailAccount}
                    onChange={(e) => setSelectedEmailAccount(e.target.value)}
                    className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm cursor-pointer"
                  >
                    {connectedEmails.map((acc) => (
                      <option key={acc.id} value={acc.from_email}>
                        {acc.name} ({acc.from_email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-3 py-1.5 text-xs font-medium text-base-content/60 hover:text-base-content">
                  Cancel
                </button>
                <button type="submit" disabled={savingNews || connectedEmails.length === 0} className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-content rounded-lg hover:bg-primary/90 disabled:opacity-40">
                  {savingNews ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add Subscribers */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-base-100 border border-base-300/50 rounded-xl p-5 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Add / Import Subscribers</h3>
              <button onClick={() => setShowSubModal(false)} className="text-base-content/40 hover:text-base-content">
                <RiCloseLine size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-4 border-b border-base-300/40 pb-2">
              <button
                type="button"
                onClick={() => setSubMode("list")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  subMode === "list" ? "bg-primary/15 text-primary border border-primary/30" : "text-base-content/50 hover:bg-base-300/40"
                }`}
              >
                Import from DB List
              </button>
              <button
                type="button"
                onClick={() => setSubMode("single")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  subMode === "single" ? "bg-primary/15 text-primary border border-primary/30" : "text-base-content/50 hover:bg-base-300/40"
                }`}
              >
                Single Contact
              </button>
            </div>
            <form onSubmit={handleAddSubscriber} className="space-y-3">
              {subMode === "list" ? (
                <div>
                  <label className="text-xs font-medium text-base-content/70">Select Database Prospect List</label>
                  {dbLists.length === 0 ? (
                    <div className="text-xs text-base-content/40 mt-1">No database lists found.</div>
                  ) : (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm cursor-pointer"
                    >
                      {dbLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.target_count} contacts)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-base-content/70">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="subscriber@domain.com"
                      value={subEmail}
                      onChange={(e) => setSubEmail(e.target.value)}
                      className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-base-content/70">Full Name (optional)</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSubModal(false)} className="px-3 py-1.5 text-xs font-medium text-base-content/60 hover:text-base-content">
                  Cancel
                </button>
                <button type="submit" disabled={addingSub} className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-content rounded-lg hover:bg-primary/90 disabled:opacity-40">
                  {addingSub ? "Importing…" : subMode === "list" ? "Import Contacts" : "Add Subscriber"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Compose Edition with Banner Upload & Live Preview */}
      {showEditionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-base-100 border border-base-300/50 rounded-xl p-5 w-full max-w-xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Compose Newsletter Issue</h3>
              <button onClick={() => setShowEditionModal(false)} className="text-base-content/40 hover:text-base-content">
                <RiCloseLine size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateEdition} className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-base-content/70">Issue Title / Topic</label>
                  <button
                    type="button"
                    onClick={handleGenerateAIContent}
                    disabled={aiGenerating || !edTitle.trim()}
                    className="inline-flex items-center gap-1 text-xs text-secondary hover:text-secondary/80 font-medium disabled:opacity-40 transition-colors"
                  >
                    {aiGenerating ? <RiLoader4Line size={12} className="animate-spin" /> : billingStatus && !billingStatus.isPaid ? <RiLockLine size={12} /> : <RiMagicLine size={12} />}
                    {aiGenerating ? "Generating..." : "Generate with AI (Gemini)"}
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Issue #12 — Breakthroughs in AI Agents"
                  value={edTitle}
                  onChange={(e) => setEdTitle(e.target.value)}
                  className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>

              {/* Banner Image Upload */}
              <div>
                <label className="text-xs font-medium text-base-content/70">Header Banner Image (Optional)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    placeholder="https://... or upload banner image"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    className="flex-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                  <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-base-300/60 text-base-content hover:bg-base-300 transition-colors shrink-0">
                    {uploadingBanner ? <RiLoader4Line size={13} className="animate-spin" /> : <RiImageAddLine size={13} />}
                    {uploadingBanner ? "Uploading..." : "Upload Banner"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                    />
                  </label>
                </div>
                {bannerUrl && (
                  <div className="mt-2 text-center border border-base-300/40 rounded-lg p-2 bg-base-200/40">
                    <img src={bannerUrl} alt="Banner Preview" className="max-h-24 mx-auto rounded border" />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-base-content/70">Email Subject</label>
                <input
                  type="text"
                  required
                  placeholder="Subject line for email clients"
                  value={edSubject}
                  onChange={(e) => setEdSubject(e.target.value)}
                  className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-base-content/70">Content (HTML / Plain text)</label>
                <textarea
                  required
                  rows={6}
                  placeholder="Write or generate your newsletter HTML content..."
                  value={edContent}
                  onChange={(e) => setEdContent(e.target.value)}
                  className="w-full mt-1 bg-base-200 border border-base-300/50 rounded-lg px-3 py-2 text-sm font-mono resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    let previewHtml = edContent;
                    if (bannerUrl && bannerUrl.trim() && !previewHtml.includes(bannerUrl.trim())) {
                      const bannerHtml = `<div style="text-align: center; margin-bottom: 24px;"><img src="${bannerUrl.trim()}" alt="Banner" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; display: block; margin: 0 auto;" /></div>`;
                      previewHtml = `${bannerHtml}\n${previewHtml}`;
                    }
                    setPreviewEdition({ title: edTitle || "Issue Preview", subject: edSubject || "Subject Preview", content_html: previewHtml });
                  }}
                  disabled={!edContent.trim()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-base-content/70 hover:text-base-content disabled:opacity-40"
                >
                  <RiEyeLine size={14} /> Live HTML Preview
                </button>

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowEditionModal(false)} className="px-3 py-1.5 text-xs font-medium text-base-content/60 hover:text-base-content">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingEd} className="px-4 py-1.5 text-xs font-medium bg-secondary text-secondary-content rounded-lg hover:bg-secondary/90 disabled:opacity-40">
                    {savingEd ? "Saving…" : "Save Issue Draft"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Live Newsletter Preview Modal */}
      {previewEdition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-base-100 border border-base-300/50 rounded-xl p-5 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-base-300/40 mb-3">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <RiEyeLine className="text-primary" /> {previewEdition.title}
                </h3>
                <p className="text-xs text-base-content/50 mt-0.5">Subject: {previewEdition.subject}</p>
              </div>
              <button onClick={() => setPreviewEdition(null)} className="text-base-content/40 hover:text-base-content">
                <RiCloseLine size={18} />
              </button>
            </div>

            {/* Email HTML Preview Box */}
            <div className="flex-1 overflow-y-auto bg-white text-slate-800 p-6 rounded-xl border border-slate-200 shadow-inner">
              <div
                className="prose prose-slate max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: previewEdition.content_html }}
              />
            </div>

            <div className="flex justify-end pt-3">
              <button onClick={() => setPreviewEdition(null)} className="px-4 py-1.5 text-xs font-medium bg-base-300 text-base-content rounded-lg hover:bg-base-300/80">
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
