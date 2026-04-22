"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  FunnelChart,
  Funnel,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

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

interface Stats {
  steps: { step: string; SENT: number; OPENED: number; REPLIED: number; BOUNCED: number; QUEUED: number }[];
  daily: { date: string; sent: number }[];
  funnel: { stage: string; value: number }[];
}

const FUNNEL_COLORS = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981"];

export default function CampaignsDashboard({ locale }: { locale: string }) {
  const t = useTranslations("campaigns");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const qs = campaignFilter ? `?campaign=${campaignFilter}` : "";
    const [r, s] = await Promise.all([
      fetch(`/api/campaigns${qs}`).then((r) => r.json()),
      fetch(`/api/campaigns/stats${qs}`).then((r) => r.json()),
    ]);
    setRows(r);
    setStats(s);
    setLoading(false);
  }, [campaignFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const total = rows.length;
  const contacted = rows.filter((r) => r.emailsSent > 0).length;
  const replied = rows.filter((r) => r.repliedAt != null).length;
  const meetings = rows.filter((r) => r.meetingBooked).length;
  const replyRate = contacted > 0 ? Math.round((replied / contacted) * 1000) / 10 : 0;

  async function action(id: string, act: "pause" | "resume" | "stop") {
    setBusyId(id);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    setBusyId(null);
    refresh();
  }

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

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Emails per step × status</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.steps}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="QUEUED" stackId="a" fill="#a1a1aa" />
                <Bar dataKey="SENT" stackId="a" fill="#6366f1" />
                <Bar dataKey="OPENED" stackId="a" fill="#0ea5e9" />
                <Bar dataKey="REPLIED" stackId="a" fill="#10b981" />
                <Bar dataKey="BOUNCED" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Daily sends (30d)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Funnel</h3>
            <ResponsiveContainer width="100%" height={200}>
              <FunnelChart>
                <Tooltip />
                <Funnel dataKey="value" data={stats.funnel} isAnimationActive>
                  {stats.funnel.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i]} />
                  ))}
                  <LabelList position="right" dataKey="stage" stroke="none" fill="#27272a" fontSize={11} />
                  <LabelList position="center" dataKey="value" stroke="none" fill="#fff" fontSize={12} />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">Loading…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">{t("noTargets")}</td>
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
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    {!row.stopped && !row.paused && (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => action(row.id, "pause")}
                        className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Pause
                      </button>
                    )}
                    {(row.paused || row.stopped) && (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => action(row.id, "resume")}
                        className="px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Resume
                      </button>
                    )}
                    {!row.stopped && (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => action(row.id, "stop")}
                        className="px-2 py-1 text-xs rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                      >
                        Stop
                      </button>
                    )}
                  </div>
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
