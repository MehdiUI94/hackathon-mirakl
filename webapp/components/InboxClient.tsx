"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

interface Draft {
  id: string;
  brandId: string | null;
  marketplaceId: string | null;
  brandName: string;
  marketplaceName: string;
  campaign: string | null;
  step: number;
  branch: string | null;
  toEmail: string;
  toFirstName: string | null;
  subject: string;
  bodyText: string;
  cta: string | null;
  stopRule: string | null;
  claimSources: string;
  callbackUrl: string | null;
  status: string;
  edited: boolean;
  receivedAt: string;
  decidedAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
}

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

const STATUS_TABS = [
  { key: "PENDING", labelKey: "pending", dot: "bg-amber-500", num: "I" },
  { key: "EDITED", labelKey: "edited", dot: "bg-violet-500", num: "II" },
  { key: "SENT", labelKey: "sent", dot: "bg-emerald-600", num: "III" },
  { key: "DISCARDED", labelKey: "discarded", dot: "bg-stone-400", num: "IV" },
  { key: "FAILED", labelKey: "failed", dot: "bg-rose-600", num: "V" },
] as const;

export default function InboxClient({ locale: _locale }: { locale: string }) {
  const t = useTranslations("inbox");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<
    | null
    | { type: "send" | "discard"; draft: Draft }
    | { type: "bulkSend" | "bulkDiscard"; ids: string[] }
  >(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("q", search);
    const res = await fetch(`/api/drafts?${params}`);
    const data = await res.json();
    setDrafts(data.drafts ?? []);
    setCounts(data.counts ?? {});
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  function pushToast(type: Toast["type"], message: string) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  async function approve(draft: Draft) {
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/approve`, { method: "POST" });
      if (res.ok) {
        pushToast("success", `Email envoyé à ${draft.toEmail}`);
        setSelected(null);
        setConfirm(null);
        refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        pushToast("error", err.error ?? "Échec de l'envoi");
      }
    } finally {
      setBusy(false);
    }
  }

  async function discard(draft: Draft) {
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      if (res.ok) {
        pushToast("info", "Aperçu refusé");
        setSelected(null);
        setConfirm(null);
        refresh();
      } else {
        pushToast("error", "Échec de la suppression");
      }
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(ids: string[], action: "approve" | "discard") {
    setBusy(true);
    try {
      const res = await fetch("/api/drafts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (res.ok) {
        const data = await res.json();
        const verb = action === "approve" ? "envoyé" : "refusé";
        const failed = data.total - data.ok;
        if (failed === 0) {
          pushToast("success", `${data.ok} aperçu${data.ok > 1 ? "s" : ""} ${verb}${data.ok > 1 ? "s" : ""}`);
        } else {
          pushToast("error", `${data.ok}/${data.total} traité${data.total > 1 ? "s" : ""}, ${failed} en échec`);
        }
        setChecked(new Set());
        setConfirm(null);
        refresh();
      } else {
        pushToast("error", "Échec de l'action groupée");
      }
    } finally {
      setBusy(false);
    }
  }

  // Reset selection when filter or search changes
  useEffect(() => {
    setChecked(new Set());
  }, [statusFilter, search]);

  const selectableIds = useMemo(
    () => drafts.filter((d) => d.status === "PENDING" || d.status === "EDITED").map((d) => d.id),
    [drafts]
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => checked.has(id));
  const someSelected = checked.size > 0;

  function toggleRow(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setChecked(new Set());
    else setChecked(new Set(selectableIds));
  }

  async function saveEdits(draft: Draft, subject: string, bodyText: string, toEmail: string, toFirstName: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyText, toEmail, toFirstName }),
      });
      if (res.ok) {
        const updated = await res.json();
        pushToast("success", "Modifications enregistrées");
        setSelected(updated);
        refresh();
      } else {
        pushToast("error", "Échec de l'enregistrement");
      }
    } finally {
      setBusy(false);
    }
  }

  const total = useMemo(() => drafts.length, [drafts]);

  return (
    <div className="space-y-10">
      {/* Editorial KPI rail — five columns separated by hairlines */}
      <div className="grid grid-cols-2 sm:grid-cols-5 border-y border-rule rise">
        {STATUS_TABS.map((s, i) => {
          const count = counts[s.key] ?? 0;
          const active = statusFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`group relative text-left py-6 px-5 transition-colors ${
                i > 0 ? "sm:border-l border-rule" : ""
              } ${active ? "bg-paper-2/60" : "hover:bg-paper-2/30"}`}
            >
              {/* Active marker — top hairline */}
              <span
                className={`absolute top-0 left-0 right-0 h-px transition-all ${
                  active ? "bg-ink" : "bg-transparent group-hover:bg-rule-strong"
                }`}
              />
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-mono text-[10px] tracking-widest text-muted`}>{s.num}</span>
                <span className={`w-1 h-1 rounded-full ${s.dot}`} />
                <span className="eyebrow !text-[10px]">{t(s.labelKey)}</span>
              </div>
              <div className="font-display text-[44px] leading-none tnum text-ink">
                {String(count).padStart(2, "0")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Operator note — editorial sidebar callout */}
      <aside className="flex items-start gap-5 pl-5 border-l-2 border-ember">
        <p className="text-[14px] text-ink-2 leading-relaxed max-w-2xl">
          <span className="font-display italic text-ember mr-1.5">Note —</span>
          {t("operatorHint")}
        </p>
      </aside>

      {/* Filter row */}
      <div className="flex items-center gap-5 pb-3 border-b border-rule">
        {selectableIds.length > 0 && (
          <label className="flex items-center gap-2 cursor-pointer group">
            <span
              className={`relative w-4 h-4 border transition-colors ${
                allSelected ? "bg-ink border-ink" : "border-ink-2/30 group-hover:border-ink"
              }`}
            >
              {allSelected && (
                <svg className="absolute inset-0 w-full h-full text-paper p-[1px]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
                </svg>
              )}
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="sr-only" />
            </span>
            <span className="eyebrow group-hover:text-ink transition-colors">
              {allSelected ? "Désélectionner" : "Sélectionner tout"}
            </span>
          </label>
        )}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full text-[14px] bg-transparent border-0 border-b border-rule focus:border-ink py-2 px-0 placeholder:text-muted/60 focus:outline-none transition-colors"
          />
        </div>
        <span className="eyebrow">{String(total).padStart(2, "0")} aperçu{total > 1 ? "s" : ""}</span>
      </div>

      {/* List */}
      <div className="rise rise-2">
        {loading && (
          <div className="px-6 py-16 text-center eyebrow">Chargement</div>
        )}
        {!loading && drafts.length === 0 && (
          <div className="px-6 py-24 text-center max-w-md mx-auto">
            <div className="font-display italic text-2xl text-ink mb-2">
              Tirage en attente
            </div>
            <p className="text-[14px] text-muted leading-relaxed">{t("empty")}</p>
          </div>
        )}
        {!loading && drafts.length > 0 && (
          <ul className="divide-y divide-rule">
            {drafts.map((d, idx) => {
              const isPending = d.status === "PENDING" || d.status === "EDITED";
              const isChecked = checked.has(d.id);
              return (
                <li
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={`group relative grid grid-cols-[28px_28px_1fr_auto] gap-5 items-baseline py-6 cursor-pointer transition-colors ${
                    isChecked ? "bg-paper-2/50" : "hover:bg-paper-2/30"
                  }`}
                >
                  {/* Index */}
                  <span className="font-mono text-[10px] tracking-widest text-muted/60 self-center text-right pr-1">
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  {/* Checkbox or status */}
                  {isPending ? (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="self-center cursor-pointer flex items-center justify-center"
                    >
                      <span
                        className={`relative w-4 h-4 border transition-colors ${
                          isChecked ? "bg-ink border-ink" : "border-ink-2/30 hover:border-ink"
                        }`}
                      >
                        {isChecked && (
                          <svg className="absolute inset-0 w-full h-full text-paper p-[1px]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
                          </svg>
                        )}
                        <input type="checkbox" checked={isChecked} onChange={() => toggleRow(d.id)} className="sr-only" />
                      </span>
                    </label>
                  ) : (
                    <span className="self-center flex justify-center">
                      <StatusDot status={d.status} />
                    </span>
                  )}

                  {/* Content */}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className="font-display text-[22px] leading-none text-ink tracking-tight">
                        {d.brandName}
                      </span>
                      <span className="text-muted/40 text-sm">·</span>
                      <span className="font-display italic text-[19px] text-muted leading-none">
                        {d.marketplaceName}
                      </span>
                      {d.campaign && (
                        <span className="font-mono text-[10px] tracking-widest text-muted/80 ml-1">
                          {d.campaign} · S{String(d.step).padStart(2, "0")}
                        </span>
                      )}
                      {d.edited && (
                        <span className="font-mono text-[9px] tracking-widest text-ember uppercase border border-ember/40 px-1.5 py-0.5 ml-1">
                          {t("edited_badge")}
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] text-ink-2 mt-2 truncate leading-snug">
                      {d.subject}
                    </div>
                    <div className="flex items-center gap-3 mt-2 eyebrow !text-[10px]">
                      <span>{d.toEmail}</span>
                      <span className="text-muted/30">·</span>
                      <span>{relTime(d.receivedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="self-center pr-2" onClick={(e) => e.stopPropagation()}>
                    {isPending ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setConfirm({ type: "discard", draft: d })}
                          className="font-mono text-[10px] tracking-widest uppercase text-muted hover:text-rose-700 px-3 py-2 transition-colors"
                        >
                          {t("discard")}
                        </button>
                        <button
                          onClick={() => setConfirm({ type: "send", draft: d })}
                          className="font-mono text-[10px] tracking-widest uppercase text-paper bg-ink hover:bg-ember px-4 py-2 transition-colors"
                        >
                          {t("approveSimple")} →
                        </button>
                      </div>
                    ) : (
                      <span className="eyebrow !text-[10px]">
                        {d.status === "SENT" && d.sentAt ? relTime(d.sentAt) : "—"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <DraftDrawer
          draft={selected}
          t={t}
          onClose={() => setSelected(null)}
          onSave={saveEdits}
          onSendRequest={() => setConfirm({ type: "send", draft: selected })}
          onDiscardRequest={() => setConfirm({ type: "discard", draft: selected })}
          busy={busy}
        />
      )}

      {/* Confirm modal */}
      {confirm && (() => {
        const isBulk = confirm.type === "bulkSend" || confirm.type === "bulkDiscard";
        const isDanger = confirm.type === "discard" || confirm.type === "bulkDiscard";
        const count = isBulk && "ids" in confirm ? confirm.ids.length : 1;
        let title: string, body: string;
        if (confirm.type === "send") {
          title = t("confirmSendTitle");
          body = t("confirmSendBody", { email: confirm.draft.toEmail });
        } else if (confirm.type === "discard") {
          title = t("confirmDiscardTitle");
          body = t("confirmDiscardBody");
        } else if (confirm.type === "bulkSend") {
          title = `Envoyer ${count} email${count > 1 ? "s" : ""} ?`;
          body = `Les ${count} aperçus sélectionnés vont être envoyés à leurs destinataires respectifs. Cette action est irréversible.`;
        } else {
          title = `Refuser ${count} aperçu${count > 1 ? "s" : ""} ?`;
          body = `Les ${count} aperçus sélectionnés vont être refusés et n8n sera notifié.`;
        }
        return (
          <ConfirmModal
            title={title}
            body={body}
            confirmLabel={isDanger ? t("discard") : t("approveSimple")}
            cancelLabel={t("cancel")}
            danger={isDanger}
            busy={busy}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              if (confirm.type === "send") approve(confirm.draft);
              else if (confirm.type === "discard") discard(confirm.draft);
              else if (confirm.type === "bulkSend") bulkAction(confirm.ids, "approve");
              else if (confirm.type === "bulkDiscard") bulkAction(confirm.ids, "discard");
            }}
          />
        );
      })()}

      {/* Floating bulk action bar — editorial */}
      {someSelected && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-stretch bg-ink text-paper shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] rise">
          <div className="flex items-baseline gap-3 px-5 py-4 border-r border-paper/15">
            <span className="font-display text-2xl tnum leading-none">
              {String(checked.size).padStart(2, "0")}
            </span>
            <span className="font-mono text-[10px] tracking-widest text-paper/60 uppercase">
              sélectionné{checked.size > 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setChecked(new Set())}
            className="px-4 font-mono text-[10px] tracking-widest text-paper/60 hover:text-paper uppercase transition-colors border-r border-paper/15"
          >
            Annuler
          </button>
          <button
            onClick={() => setConfirm({ type: "bulkDiscard", ids: Array.from(checked) })}
            className="px-4 font-mono text-[10px] tracking-widest text-paper/70 hover:text-rose-300 hover:bg-rose-950/30 uppercase transition-colors border-r border-paper/15"
          >
            Refuser tout
          </button>
          <button
            onClick={() => setConfirm({ type: "bulkSend", ids: Array.from(checked) })}
            className="px-6 bg-ember hover:bg-ember/90 text-paper font-mono text-[10px] tracking-widest uppercase transition-colors flex items-center gap-2"
          >
            Approuver tout
            <span className="font-display italic text-base normal-case tracking-normal">→</span>
          </button>
        </div>
      )}

      {/* Toasts — editorial chip */}
      <div className="fixed bottom-8 right-8 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-5 py-3.5 text-[13px] flex items-center gap-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)] rise ${
              toast.type === "success"
                ? "bg-paper border-l-2 border-emerald-600 text-ink"
                : toast.type === "error"
                ? "bg-paper border-l-2 border-rose-600 text-ink"
                : "bg-ink border-l-2 border-ember text-paper"
            }`}
          >
            <span
              className={`w-1 h-1 rounded-full ${
                toast.type === "success"
                  ? "bg-emerald-600"
                  : toast.type === "error"
                  ? "bg-rose-600"
                  : "bg-ember"
              }`}
            />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- subcomponents ----

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-500",
    EDITED: "bg-violet-500",
    SENT: "bg-emerald-600",
    DISCARDED: "bg-stone-400",
    FAILED: "bg-rose-600",
  };
  return (
    <span className={`w-1.5 h-1.5 rounded-full ${map[status] ?? "bg-stone-300"}`} />
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function DraftDrawer({
  draft,
  t,
  onClose,
  onSave,
  onSendRequest,
  onDiscardRequest,
  busy,
}: {
  draft: Draft;
  t: (k: string, vars?: Record<string, string>) => string;
  onClose: () => void;
  onSave: (d: Draft, subject: string, body: string, email: string, fname: string) => void;
  onSendRequest: () => void;
  onDiscardRequest: () => void;
  busy: boolean;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [bodyText, setBodyText] = useState(draft.bodyText);
  const [toEmail, setToEmail] = useState(draft.toEmail);
  const [toFirstName, setToFirstName] = useState(draft.toFirstName ?? "");

  useEffect(() => {
    setSubject(draft.subject);
    setBodyText(draft.bodyText);
    setToEmail(draft.toEmail);
    setToFirstName(draft.toFirstName ?? "");
  }, [draft.id]);

  const dirty =
    subject !== draft.subject ||
    bodyText !== draft.bodyText ||
    toEmail !== draft.toEmail ||
    (toFirstName ?? "") !== (draft.toFirstName ?? "");

  const editable = draft.status === "PENDING" || draft.status === "EDITED";
  const sources = (() => {
    try { return JSON.parse(draft.claimSources) as string[]; } catch { return []; }
  })();

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="w-full max-w-[640px] bg-paper overflow-y-auto border-l border-rule-strong">
        {/* Masthead */}
        <div className="px-10 pt-10 pb-6 sticky top-0 bg-paper z-10 border-b border-rule">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="eyebrow mb-2">
                {draft.campaign ?? "—"} · {t("step")} {String(draft.step).padStart(2, "0")}
                {draft.branch ? ` · ${draft.branch}` : ""}
              </div>
              <h2 className="font-display text-[38px] leading-[0.95] text-ink tracking-tight">
                {draft.brandName}
                <span className="text-muted/50 mx-2.5">/</span>
                <em className="text-ember">{draft.marketplaceName}</em>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="font-mono text-[10px] tracking-widest uppercase text-muted hover:text-ink transition-colors p-2 -mr-2"
              aria-label="Close"
            >
              Fermer ×
            </button>
          </div>
        </div>

        <div className="px-10 py-8 space-y-7">
          {/* Recipient */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="eyebrow block mb-1.5">{t("to")}</label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                disabled={!editable}
                className="w-full text-[14px] bg-transparent border-0 border-b border-rule focus:border-ink py-2 px-0 focus:outline-none transition-colors disabled:opacity-50"
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Prénom</label>
              <input
                type="text"
                value={toFirstName}
                onChange={(e) => setToFirstName(e.target.value)}
                disabled={!editable}
                className="w-full text-[14px] bg-transparent border-0 border-b border-rule focus:border-ink py-2 px-0 focus:outline-none transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Subject — serif, inline editable */}
          <div>
            <label className="eyebrow block mb-2">{t("subject")}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!editable}
              className="w-full font-display text-[24px] leading-tight bg-transparent border-0 border-b border-rule focus:border-ink pb-2 px-0 focus:outline-none transition-colors disabled:opacity-50 tracking-tight"
            />
          </div>

          {/* Body */}
          <div>
            <label className="eyebrow block mb-2">{t("body")}</label>
            <textarea
              rows={16}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              disabled={!editable}
              className="w-full text-[14px] bg-paper-2/40 border border-rule focus:border-ink-2/40 px-5 py-4 leading-[1.7] focus:outline-none transition-colors disabled:opacity-60"
              style={{ fontFamily: "var(--font-geist-sans), system-ui" }}
            />
          </div>

          {/* Metadata — editorial side list */}
          {(draft.cta || draft.stopRule || sources.length > 0) && (
            <div className="border-t border-rule pt-6 space-y-4">
              {draft.cta && (
                <div className="grid grid-cols-[120px_1fr] gap-4">
                  <span className="eyebrow">{t("cta")}</span>
                  <span className="text-[13px] text-ink-2 leading-relaxed">{draft.cta}</span>
                </div>
              )}
              {draft.stopRule && (
                <div className="grid grid-cols-[120px_1fr] gap-4">
                  <span className="eyebrow">{t("stopRule")}</span>
                  <span className="text-[13px] text-ink-2 leading-relaxed">{draft.stopRule}</span>
                </div>
              )}
              {sources.length > 0 && (
                <div className="grid grid-cols-[120px_1fr] gap-4">
                  <span className="eyebrow">{t("claimSources")}</span>
                  <ul className="space-y-1">
                    {sources.map((s, i) => (
                      <li key={i}>
                        <a
                          href={s}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-ink underline decoration-ember decoration-1 underline-offset-4 hover:decoration-2 break-all"
                        >
                          {s}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {draft.errorMessage && (
            <div className="border-l-2 border-rose-600 pl-4 py-2 text-[13px] text-ink-2">
              <span className="eyebrow !text-rose-600 block mb-1">Erreur du dernier envoi</span>
              {draft.errorMessage}
            </div>
          )}
        </div>

        {/* Sticky action bar */}
        {editable && (
          <div className="sticky bottom-0 px-10 py-5 bg-paper border-t border-rule flex items-center gap-3">
            <button
              onClick={onDiscardRequest}
              disabled={busy}
              className="font-mono text-[10px] tracking-widest uppercase text-muted hover:text-rose-700 transition-colors disabled:opacity-50 py-2"
            >
              {t("discard")}
            </button>
            <div className="flex-1" />
            {dirty && (
              <button
                onClick={() => onSave(draft, subject, bodyText, toEmail, toFirstName)}
                disabled={busy}
                className="font-mono text-[10px] tracking-widest uppercase text-ink-2 hover:text-ink border border-rule-strong px-4 py-2.5 transition-colors disabled:opacity-50"
              >
                {busy ? t("saving") : t("saveChanges")}
              </button>
            )}
            <button
              onClick={onSendRequest}
              disabled={busy}
              className="font-mono text-[10px] tracking-widest uppercase bg-ink text-paper hover:bg-ember px-6 py-2.5 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {t("approve")}
              <span className="font-display italic text-base normal-case tracking-normal">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-paper border-t-2 border-ember shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)] rise">
        <div className="px-7 pt-7 pb-5">
          <div className="eyebrow mb-2.5">
            {danger ? "Action irréversible" : "Confirmation requise"}
          </div>
          <h3 className="font-display text-[28px] leading-tight text-ink tracking-tight mb-3">
            {title}
          </h3>
          <p className="text-[14px] text-ink-2 leading-relaxed">{body}</p>
        </div>
        <div className="px-7 py-4 border-t border-rule flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="font-mono text-[10px] tracking-widest uppercase text-muted hover:text-ink transition-colors disabled:opacity-50 px-4 py-2.5"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`font-mono text-[10px] tracking-widest uppercase text-paper px-6 py-2.5 transition-colors disabled:opacity-50 flex items-center gap-2 ${
              danger ? "bg-rose-700 hover:bg-rose-800" : "bg-ink hover:bg-ember"
            }`}
          >
            {busy ? "…" : confirmLabel}
            {!busy && (
              <span className="font-display italic text-base normal-case tracking-normal">→</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
