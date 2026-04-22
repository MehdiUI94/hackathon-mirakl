"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface CampaignRow {
  id: string;
  brandId: string;
  brandName: string;
  marketplaceName: string;
  campaign: string;
  topScore: number | null;
  priority: string | null;
  paused: boolean;
  stopped: boolean;
  emailsSent: number;
  lastStep: number;
  repliedAt: string | null;
  replyType: string | null;
  meetingBooked: boolean;
  lastSentAt: string | null;
}

export default function CampaignsDashboard({ locale }: { locale: string }) {
  const t = useTranslations("campaigns");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState("");

  useEffect(() => {
    fetch(`/api/campaigns${campaignFilter ? `?campaign=${campaignFilter}` : ""}`)
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, [campaignFilter]);

  const total = rows.length;
  const contacted = rows.filter((r) => r.emailsSent > 0).length;
  const replied = rows.filter((r) => r.repliedAt != null).length;
  const meetings = rows.filter((r) => r.meetingBooked).length;
  const replyRate = contacted > 0 ? Math.round((replied / contacted) * 1000) / 10 : 0;

  function exportCSV() {
    const headers = ["Brand", "Marketplace", "Campaign", "Score", "Priority", "Emails Sent", "Last Step", "Replied", "Meeting", "Reply Type"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.brandName}"`,
          `"${r.marketplaceName}"`,
          r.campaign,
          r.topScore ?? "",
          r.priority ?? "",
          r.emailsSent,
          r.lastStep,
          r.repliedAt ? new Date(r.repliedAt).toLocaleDateString() : "",
          r.meetingBooked ? "Yes" : "No",
          r.replyType ?? "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaigns.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t("totalTargets"), value: total, color: "text-zinc-700" },
          { label: t("contacted"), value: contacted, color: "text-blue-700" },
          { label: t("replied"), value: replied, color: "text-amber-700" },
          { label: t("meetings"), value: meetings, color: "text-emerald-700" },
          { label: "Reply Rate", value: `${replyRate}%`, color: "text-violet-700" },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + export bar */}
      <div className="flex items-center gap-3">
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All Campaigns</option>
          <option value="C1">Campaign 1 — Main</option>
          <option value="C2">Campaign 2 — Zalando</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {t("export")}
        </button>
      </div>

      {/* Pipeline table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase tracking-wide">
              <th className="text-left px-4 py-3">{t("brand")}</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">{t("marketplace")}</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">{t("campaign")}</th>
              <th className="text-right px-4 py-3 hidden lg:table-cell">Score</th>
              <th className="text-right px-4 py-3">Emails</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Step</th>
              <th className="text-right px-4 py-3">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Loading…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">{t("noTargets")}</td>
              </tr>
            )}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3">
                  <a href={`/${locale}/brands/${row.brandId}`} className="font-medium text-zinc-900 hover:text-indigo-600">
                    {row.brandName}
                  </a>
                </td>
                <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">{row.marketplaceName}</td>
                <td className="px-4 py-3 text-zinc-500 hidden md:table-cell text-xs">{row.campaign}</td>
                <td className="px-4 py-3 text-right font-mono text-zinc-600 hidden lg:table-cell">
                  {row.topScore?.toFixed(1) ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600">{row.emailsSent}</td>
                <td className="px-4 py-3 text-right text-zinc-500 hidden sm:table-cell">{row.lastStep || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <StatusBadge row={row} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && (
          <div className="px-4 py-2 border-t border-zinc-100 text-xs text-zinc-400">
            {rows.length} targets
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ row, t }: { row: CampaignRow; t: (k: string) => string }) {
  if (row.meetingBooked)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Meeting</span>;
  if (row.replyType === "UNSUBSCRIBE" || row.stopped)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-500">{t("stopped")}</span>;
  if (row.paused)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">{t("paused")}</span>;
  if (row.repliedAt)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Replied</span>;
  if (row.emailsSent > 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700">{t("active")}</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-400">Queued</span>;
}
