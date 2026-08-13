/**
 * LinkedIn-style post composer — all toolbar actions usable.
 * Media / document / poll use structured data; event, celebrate, hiring, expert
 * open inline forms and publish as a well-formatted post (runner + LinkedIn UI).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  RiCloseLine,
  RiImageLine,
  RiCalendarEventLine,
  RiBarChart2Line,
  RiFileTextLine,
  RiBriefcaseLine,
  RiAwardLine,
  RiUserSearchLine,
  RiTimeLine,
  RiEarthLine,
  RiGroupLine,
  RiArrowDownSLine,
  RiLoader4Line,
  RiDeleteBinLine,
  RiInformationLine,
} from "react-icons/ri";

export type AccountOpt = { id: string; name: string; email: string; is_authenticated: number };

type MediaItem = { path: string; url: string; type: "image" | "video" | "document"; name: string };
type PostType = "text" | "poll" | "event" | "celebrate" | "hiring" | "expert";

type PollState = { question: string; options: string[]; durationDays: 1 | 3 | 7 | 14 };
type EventState = { title: string; start: string; end: string; location: string; description: string };
type CelebrateState = { occasion: string; message: string };
type HiringState = { jobTitle: string; location: string; message: string };
type ExpertState = { topic: string; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: AccountOpt[];
  defaultAccountId?: string;
  onCreated?: () => void;
};

const VISIBILITY_OPTIONS = [
  { value: "anyone" as const, label: "Anyone", desc: "Anyone on or off LinkedIn", icon: RiEarthLine },
  { value: "connections" as const, label: "Connections only", desc: "Only your 1st-degree connections", icon: RiGroupLine },
];

const OCCASIONS = [
  "New position",
  "Work anniversary",
  "Education",
  "Certification",
  "Launch",
  "Milestone",
  "Other",
];

function buildBodyText(
  content: string,
  postType: PostType,
  event: EventState,
  celebrate: CelebrateState,
  hiring: HiringState,
  expert: ExpertState
): string {
  const base = content.trim();
  if (postType === "event" && event.title.trim()) {
    const parts = [
      `📅 Event: ${event.title.trim()}`,
      event.start ? `Starts: ${event.start.replace("T", " ")}` : null,
      event.end ? `Ends: ${event.end.replace("T", " ")}` : null,
      event.location.trim() ? `Location: ${event.location.trim()}` : null,
      event.description.trim() || null,
      base || null,
    ];
    return parts.filter(Boolean).join("\n");
  }
  if (postType === "celebrate") {
    const parts = [
      `🎉 Celebrating: ${celebrate.occasion || "a milestone"}`,
      celebrate.message.trim() || null,
      base || null,
    ];
    return parts.filter(Boolean).join("\n\n");
  }
  if (postType === "hiring" && hiring.jobTitle.trim()) {
    const parts = [
      `We're hiring: ${hiring.jobTitle.trim()}`,
      hiring.location.trim() ? `Location: ${hiring.location.trim()}` : null,
      hiring.message.trim() || null,
      base || null,
    ];
    return parts.filter(Boolean).join("\n");
  }
  if (postType === "expert" && expert.topic.trim()) {
    const parts = [
      `Looking for insights on: ${expert.topic.trim()}`,
      expert.message.trim() || null,
      base || null,
    ];
    return parts.filter(Boolean).join("\n\n");
  }
  return base;
}

export default function PostComposer({ open, onClose, accounts, defaultAccountId, onCreated }: Props) {
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || "");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"anyone" | "connections">("anyone");
  const [commentControl, setCommentControl] = useState("anyone");
  const [brandPartnership, setBrandPartnership] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [postType, setPostType] = useState<PostType>("text");
  const [poll, setPoll] = useState<PollState>({ question: "", options: ["", ""], durationDays: 7 });
  const [event, setEvent] = useState<EventState>({ title: "", start: "", end: "", location: "", description: "" });
  const [celebrate, setCelebrate] = useState<CelebrateState>({ occasion: "New position", message: "" });
  const [hiring, setHiring] = useState<HiringState>({ jobTitle: "", location: "", message: "" });
  const [expert, setExpert] = useState<ExpertState>({ topic: "", message: "" });
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hoverTool, setHoverTool] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedAccount = accounts.find((a) => a.id === accountId) || accounts[0];

  const resetForm = useCallback(() => {
    setAccountId(defaultAccountId || accounts.find((a) => a.is_authenticated)?.id || accounts[0]?.id || "");
    setContent("");
    setMedia([]);
    setPostType("text");
    setPoll({ question: "", options: ["", ""], durationDays: 7 });
    setEvent({ title: "", start: "", end: "", location: "", description: "" });
    setCelebrate({ occasion: "New position", message: "" });
    setHiring({ jobTitle: "", location: "", message: "" });
    setExpert({ topic: "", message: "" });
    setScheduleMode(false);
    setScheduleAt("");
    setShowSettings(false);
    setVisibility("anyone");
    setCommentControl("anyone");
    setBrandPartnership(false);
  }, [defaultAccountId, accounts]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    const t = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        if (showSettings) setShowSettings(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, showSettings, onClose]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    // LinkedIn does not allow media/documents together with a poll
    setPostType((t) => (t === "poll" ? "text" : t));
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          continue;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/linkedin/posts/upload-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: base64, filename: file.name, mimeType: file.type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setMedia((m) => [...m, { path: data.path, url: data.url, type: data.type, name: data.name }]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const removeMedia = (idx: number) => setMedia((m) => m.filter((_, i) => i !== idx));

  const finalText = buildBodyText(content, postType, event, celebrate, hiring, expert);

  const canSubmit = (() => {
    if (!accountId || uploading) return false;
    if (media.length > 0) return true;
    if (postType === "poll") {
      return poll.question.trim().length > 0 && poll.options.filter((o) => o.trim()).length >= 2;
    }
    if (postType === "event") return event.title.trim().length > 0;
    if (postType === "hiring") return hiring.jobTitle.trim().length > 0;
    if (postType === "expert") return expert.topic.trim().length > 0;
    if (postType === "celebrate") return celebrate.occasion.length > 0 || content.trim().length > 0;
    return finalText.trim().length > 0;
  })();

  const clearExtra = () => {
    setPostType("text");
  };

  const submit = async (asDraft = false) => {
    if (!accountId) {
      toast.error("Select a LinkedIn account");
      return;
    }
    if (!asDraft && !canSubmit) {
      toast.error("Add content or complete the form for this post type");
      return;
    }
    if (postType === "poll") {
      const opts = poll.options.map((o) => o.trim()).filter(Boolean);
      if (!poll.question.trim() || opts.length < 2) {
        toast.error("Poll needs a question and at least 2 options");
        return;
      }
    }
    if (!asDraft && scheduleMode && !scheduleAt) {
      toast.error("Pick a date and time to schedule");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        account_id: accountId,
        content: finalText,
        visibility,
        comment_control: commentControl,
        brand_partnership: brandPartnership,
        post_type: postType === "expert" ? "expert" : postType,
        media: media.map((m) => ({ path: m.path, type: m.type, name: m.name })),
      };
      if (postType === "poll") {
        body.poll = {
          question: poll.question.trim(),
          options: poll.options.map((o) => o.trim()).filter(Boolean),
          durationDays: poll.durationDays,
        };
      }
      if (postType === "event") {
        body.event = { ...event };
      }
      if (asDraft) body.status = "draft";
      else if (scheduleMode && scheduleAt) {
        body.scheduled_at = new Date(scheduleAt).toISOString();
        body.status = "scheduled";
      } else {
        body.scheduled_at = new Date().toISOString();
        body.status = "scheduled";
      }

      const res = await fetch("/api/linkedin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create post");

      if (asDraft) toast.success("Draft saved");
      else if (scheduleMode) toast.success("Post scheduled");
      else toast.success("Post queued — will publish shortly");
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const authAccounts = accounts.filter((a) => a.is_authenticated);
  const visLabel = visibility === "anyone" ? "Anyone" : "Connections only";

  const tools: {
    id: string;
    icon: ReactNode;
    label: string;
    onClick?: () => void;
    active?: boolean;
    disabled?: boolean;
  }[] = [
    {
      id: "media",
      icon: <RiImageLine />,
      label: "Add media",
      onClick: () => fileRef.current?.click(),
      // LinkedIn forbids media + poll on the same post
      disabled: uploading || postType === "poll",
    },
    {
      id: "event",
      icon: <RiCalendarEventLine />,
      label: "Create an event",
      onClick: () => setPostType((t) => (t === "event" ? "text" : "event")),
      active: postType === "event",
    },
    {
      id: "celebrate",
      icon: <RiAwardLine />,
      label: "Celebrate an occasion",
      onClick: () => setPostType((t) => (t === "celebrate" ? "text" : "celebrate")),
      active: postType === "celebrate",
    },
    {
      id: "hiring",
      icon: <RiBriefcaseLine />,
      label: "Share that you're hiring",
      onClick: () => setPostType((t) => (t === "hiring" ? "text" : "hiring")),
      active: postType === "hiring",
    },
    {
      id: "poll",
      icon: <RiBarChart2Line />,
      label: "Create a poll",
      onClick: () => {
        setPostType((t) => (t === "poll" ? "text" : "poll"));
        // LinkedIn does not allow poll + media/document together
        if (postType !== "poll") setMedia([]);
      },
      active: postType === "poll",
      disabled: media.length > 0,
    },
    {
      id: "doc",
      icon: <RiFileTextLine />,
      label: "Add a document",
      onClick: () => fileRef.current?.click(),
      disabled: uploading || postType === "poll",
    },
    {
      id: "expert",
      icon: <RiUserSearchLine />,
      label: "Find an expert",
      onClick: () => setPostType((t) => (t === "expert" ? "text" : "expert")),
      active: postType === "expert",
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-start justify-center sm:pt-[6vh] md:pt-[10vh] px-0 sm:px-4" role="presentation">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => !submitting && onClose()} />

      <div
        className="relative w-full sm:max-w-[552px] bg-base-200 rounded-t-2xl sm:rounded-xl shadow-2xl border border-base-300/60 flex flex-col max-h-[92dvh] sm:max-h-[min(88vh,720px)] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Create a post"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-base-300/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-base-300 flex items-center justify-center text-sm font-semibold text-base-content/70 shrink-0 ring-1 ring-base-300">
              {(selectedAccount?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              {accounts.length > 1 ? (
                <select
                  className="bg-transparent font-semibold text-[15px] text-base-content outline-none cursor-pointer max-w-[200px] truncate appearance-none pr-5"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right center",
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.is_authenticated}>
                      {a.name}
                      {!a.is_authenticated ? " (not connected)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="font-semibold text-[15px] truncate">{selectedAccount?.name || "Account"}</p>
              )}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center gap-0.5 text-xs text-base-content/55 hover:text-base-content/80 mt-0.5 transition-colors"
              >
                Post to {visLabel}
                <RiArrowDownSLine className="text-sm opacity-70" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-base-content/50 hover:bg-base-300/80 hover:text-base-content transition-colors shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <RiCloseLine className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 min-h-0">
          <textarea
            ref={textareaRef}
            className="w-full min-h-[100px] sm:min-h-[120px] bg-transparent border-0 outline-none resize-none text-[16px] leading-relaxed text-base-content placeholder:text-base-content/35"
            placeholder="What do you want to talk about?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={3000}
          />

          {/* Event form */}
          {postType === "event" && (
            <div className="mt-2 mb-3 rounded-xl border border-base-300/60 bg-base-300/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <RiCalendarEventLine className="text-base-content/50" /> Event
                </p>
                <button type="button" className="text-xs text-base-content/50 hover:text-error" onClick={clearExtra}>
                  Remove
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                placeholder="Event title *"
                value={event.title}
                onChange={(e) => setEvent((x) => ({ ...x, title: e.target.value }))}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-base-content/50 space-y-1">
                  <span>Start</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                    value={event.start}
                    onChange={(e) => setEvent((x) => ({ ...x, start: e.target.value }))}
                  />
                </label>
                <label className="text-xs text-base-content/50 space-y-1">
                  <span>End</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                    value={event.end}
                    onChange={(e) => setEvent((x) => ({ ...x, end: e.target.value }))}
                  />
                </label>
              </div>
              <input
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                placeholder="Location or link"
                value={event.location}
                onChange={(e) => setEvent((x) => ({ ...x, location: e.target.value }))}
              />
              <textarea
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 min-h-[64px] resize-y"
                placeholder="Description"
                value={event.description}
                onChange={(e) => setEvent((x) => ({ ...x, description: e.target.value }))}
              />
            </div>
          )}

          {/* Celebrate form */}
          {postType === "celebrate" && (
            <div className="mt-2 mb-3 rounded-xl border border-base-300/60 bg-base-300/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <RiAwardLine className="text-base-content/50" /> Celebrate
                </p>
                <button type="button" className="text-xs text-base-content/50 hover:text-error" onClick={clearExtra}>
                  Remove
                </button>
              </div>
              <select
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                value={celebrate.occasion}
                onChange={(e) => setCelebrate((x) => ({ ...x, occasion: e.target.value }))}
              >
                {OCCASIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 min-h-[72px] resize-y"
                placeholder="Share a few words about this occasion…"
                value={celebrate.message}
                onChange={(e) => setCelebrate((x) => ({ ...x, message: e.target.value }))}
              />
            </div>
          )}

          {/* Hiring form */}
          {postType === "hiring" && (
            <div className="mt-2 mb-3 rounded-xl border border-base-300/60 bg-base-300/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <RiBriefcaseLine className="text-base-content/50" /> Hiring
                </p>
                <button type="button" className="text-xs text-base-content/50 hover:text-error" onClick={clearExtra}>
                  Remove
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                placeholder="Job title *"
                value={hiring.jobTitle}
                onChange={(e) => setHiring((x) => ({ ...x, jobTitle: e.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                placeholder="Location (optional)"
                value={hiring.location}
                onChange={(e) => setHiring((x) => ({ ...x, location: e.target.value }))}
              />
              <textarea
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 min-h-[72px] resize-y"
                placeholder="About the role or how to apply…"
                value={hiring.message}
                onChange={(e) => setHiring((x) => ({ ...x, message: e.target.value }))}
              />
            </div>
          )}

          {/* Expert form */}
          {postType === "expert" && (
            <div className="mt-2 mb-3 rounded-xl border border-base-300/60 bg-base-300/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <RiUserSearchLine className="text-base-content/50" /> Find an expert
                </p>
                <button type="button" className="text-xs text-base-content/50 hover:text-error" onClick={clearExtra}>
                  Remove
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                placeholder="Topic or skill *"
                value={expert.topic}
                onChange={(e) => setExpert((x) => ({ ...x, topic: e.target.value }))}
              />
              <textarea
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 min-h-[72px] resize-y"
                placeholder="What kind of expertise are you looking for?"
                value={expert.message}
                onChange={(e) => setExpert((x) => ({ ...x, message: e.target.value }))}
              />
            </div>
          )}

          {/* Poll form */}
          {postType === "poll" && (
            <div className="mt-2 mb-3 rounded-xl border border-base-300/60 bg-base-300/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <RiBarChart2Line className="text-base-content/50" /> Poll
                </p>
                <button type="button" className="text-xs text-base-content/50 hover:text-error" onClick={clearExtra}>
                  Remove
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                placeholder="Your question"
                value={poll.question}
                onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
              />
              {poll.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="flex-1 w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) =>
                      setPoll((p) => {
                        const options = [...p.options];
                        options[i] = e.target.value;
                        return { ...p, options };
                      })
                    }
                  />
                  {poll.options.length > 2 && (
                    <button
                      type="button"
                      className="w-9 rounded-lg text-base-content/40 hover:text-error hover:bg-base-300/50"
                      onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                    >
                      <RiDeleteBinLine className="mx-auto" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 pt-1">
                {poll.options.length < 4 ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ""] }))}
                  >
                    + Add option
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2 text-xs text-base-content/50">
                  <span>Duration</span>
                  <select
                    className="rounded-md border border-base-300/60 bg-base-100 px-2 py-1 text-xs outline-none"
                    value={poll.durationDays}
                    onChange={(e) =>
                      setPoll((p) => ({ ...p, durationDays: Number(e.target.value) as 1 | 3 | 7 | 14 }))
                    }
                  >
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={7}>1 week</option>
                    <option value={14}>2 weeks</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {media.length > 0 && (
            <div className="mt-2 mb-3">
              <div
                className={`grid gap-2 ${
                  media.length === 1 ? "grid-cols-1" : media.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {media.map((m, i) => (
                  <div
                    key={`${m.path}-${i}`}
                    className="relative group rounded-lg overflow-hidden border border-base-300/50 bg-base-300/30 aspect-[4/3]"
                  >
                    {m.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-1.5 px-2 text-center">
                        <RiFileTextLine className="text-2xl text-base-content/40" />
                        <span className="text-xs text-base-content/55 truncate w-full">{m.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-base-content/35">{m.type}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-base-100/90 shadow-sm flex items-center justify-center text-base-content/70 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeMedia(i)}
                      aria-label="Remove"
                    >
                      <RiDeleteBinLine className="text-sm" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scheduleMode && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5">
              <RiTimeLine className="text-primary shrink-0" />
              <input
                type="datetime-local"
                className="rounded-lg border border-base-300/60 bg-base-100 px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                value={scheduleAt}
                min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-base-content/50 hover:text-base-content ml-auto"
                onClick={() => {
                  setScheduleMode(false);
                  setScheduleAt("");
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-base-content/50 py-2">
              <RiLoader4Line className="animate-spin" />
              Uploading…
            </div>
          )}
        </div>

        {/* Toolbar — all options clickable */}
        <div className="px-3 sm:px-4 py-2 border-t border-base-300/40 shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,.pdf,.doc,.docx,.ppt,.pptx"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex items-center gap-0.5 flex-wrap">
            {tools.map((tool) => (
              <div key={tool.id} className="relative">
                <button
                  type="button"
                  disabled={!!tool.disabled}
                  onClick={tool.onClick}
                  onMouseEnter={() => setHoverTool(tool.id)}
                  onMouseLeave={() => setHoverTool(null)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-colors
                    ${
                      tool.active
                        ? "bg-primary/15 text-primary"
                        : "text-base-content/45 hover:bg-base-300/70 hover:text-base-content/75"
                    }
                    disabled:opacity-35 disabled:pointer-events-none`}
                  aria-label={tool.label}
                >
                  {tool.icon}
                </button>
                {hoverTool === tool.id && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-md bg-base-100 border border-base-300 shadow-lg text-[11px] font-medium text-base-content whitespace-nowrap z-10 pointer-events-none">
                    {tool.label}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-base-300/40 shrink-0">
          <button
            type="button"
            className="text-sm text-base-content/50 hover:text-base-content/80 px-1 transition-colors"
            onClick={() => submit(true)}
            disabled={submitting}
          >
            Save draft
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Schedule for later"
              onClick={() => setScheduleMode((s) => !s)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${
                  scheduleMode
                    ? "bg-primary/15 text-primary"
                    : "text-base-content/45 hover:bg-base-300/70 hover:text-base-content/75"
                }`}
            >
              <RiTimeLine className="text-lg" />
            </button>
            <button
              type="button"
              disabled={submitting || uploading || authAccounts.length === 0 || (!scheduleMode && !canSubmit)}
              onClick={() => submit(false)}
              className="min-w-[88px] h-10 px-5 rounded-full bg-primary text-primary-content text-sm font-semibold
                hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none transition-all
                flex items-center justify-center gap-1.5 shadow-sm"
            >
              {submitting ? <RiLoader4Line className="animate-spin text-lg" /> : scheduleMode ? "Schedule" : "Post"}
            </button>
          </div>
        </div>
      </div>

      {/* Post settings */}
      {showSettings && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center px-3">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-[92vw] sm:max-w-[420px] bg-base-200 rounded-xl shadow-2xl border border-base-300/60 overflow-hidden max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300/40">
              <h3 className="text-[17px] font-semibold">Post settings</h3>
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-base-content/50 hover:bg-base-300/70"
                onClick={() => setShowSettings(false)}
              >
                <RiCloseLine className="text-lg" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5">
              <div className="flex items-start gap-2 rounded-lg bg-base-300/40 px-3 py-2 text-xs text-base-content/55">
                <RiInformationLine className="text-sm mt-0.5 shrink-0 opacity-70" />
                <span>Your selection will be saved</span>
              </div>
              <div className="space-y-2">
                {VISIBILITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = visibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                        ${active ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-base-300/50 hover:bg-base-300/30"}`}
                    >
                      <span className="w-10 h-10 rounded-full bg-base-300/80 flex items-center justify-center shrink-0">
                        <Icon className="text-lg text-base-content/60" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium">{opt.label}</span>
                        <span className="block text-xs text-base-content/45 mt-0.5">{opt.desc}</span>
                      </span>
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          active ? "border-primary" : "border-base-content/25"
                        }`}
                      >
                        {active && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <p className="text-sm font-medium">Comment control</p>
                  <p className="text-xs text-base-content/45 mt-0.5">Who can comment on this post</p>
                </div>
                <select
                  className="rounded-lg border border-base-300/60 bg-base-100 px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                  value={commentControl}
                  onChange={(e) => setCommentControl(e.target.value)}
                >
                  <option value="anyone">Anyone</option>
                  <option value="connections">Connections</option>
                  <option value="none">No one</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1">
                    Brand partnership
                    <RiInformationLine className="text-base-content/35 text-xs" />
                  </p>
                  <p className="text-xs text-base-content/45 mt-0.5">{brandPartnership ? "On" : "Off"}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={brandPartnership}
                  onClick={() => setBrandPartnership((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    brandPartnership ? "bg-primary" : "bg-base-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      brandPartnership ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-base-300/40">
              <button
                type="button"
                className="h-9 px-4 rounded-full text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                onClick={() => setShowSettings(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="h-9 px-5 rounded-full text-sm font-semibold bg-primary text-primary-content hover:brightness-110 transition-all"
                onClick={() => setShowSettings(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
