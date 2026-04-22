"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

interface ScoreResult {
  marketplaceId: string;
  marketplaceName: string;
  score: number;
  priority: string;
}

interface BrandData {
  name?: string;
  url?: string;
  country?: string;
  category?: string;
  positioning?: string;
  notes?: string;
  [key: string]: unknown;
}

interface EnrichResult {
  brand: BrandData;
  scores: ScoreResult[];
}

interface ProgressEvent {
  step: string;
  message: string;
}

export default function AddBrandClient({ locale }: { locale: string }) {
  const t = useTranslations("brands");
  const router = useRouter();

  const [inputUrl, setInputUrl] = useState("");
  const [inputName, setInputName] = useState("");
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [stage, setStage] = useState<"form" | "loading" | "review" | "saved">("form");
  const [editedBrand, setEditedBrand] = useState<BrandData>({});
  const [saving, setSaving] = useState(false);

  async function handleEnrich() {
    if (!inputUrl && !inputName) return;
    setStage("loading");
    setProgress([]);
    setResult(null);

    const res = await fetch("/api/brands/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: inputUrl || undefined, name: inputName || undefined }),
    });

    if (!res.ok || !res.body) {
      setProgress([{ step: "error", message: "Failed to start enrichment" }]);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const events = buf.split("\n\n");
      buf = events.pop() ?? "";

      for (const event of events) {
        const lines = event.split("\n");
        let eventType = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7);
          if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (!data) continue;
        const parsed = JSON.parse(data);

        if (eventType === "progress") {
          setProgress((prev) => [...prev, parsed]);
        } else if (eventType === "result") {
          setResult(parsed);
          setEditedBrand(parsed.brand);
          setStage("review");
        } else if (eventType === "error") {
          setProgress((prev) => [...prev, { step: "error", message: parsed.message }]);
          setStage("form");
        }
      }
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editedBrand.name ?? "Unnamed Brand",
        url: editedBrand.url ?? inputUrl,
        country: editedBrand.country ?? undefined,
        category: editedBrand.category ?? undefined,
        positioning: editedBrand.positioning ?? undefined,
        notes: editedBrand.notes ?? undefined,
      }),
    });

    if (res.ok) {
      const saved = await res.json();
      setStage("saved");
      router.push(`/${locale}/brands/${saved.id}`);
    } else {
      setSaving(false);
    }
  }

  if (stage === "form" || stage === "loading") {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Brand URL
            </label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com or example.com"
              disabled={stage === "loading"}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2.5 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-zinc-200" />
            <span className="text-xs text-zinc-400">or</span>
            <div className="flex-1 border-t border-zinc-200" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Brand Name
            </label>
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="e.g. Sézane"
              disabled={stage === "loading"}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2.5 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:opacity-50"
            />
          </div>

          <button
            onClick={handleEnrich}
            disabled={(!inputUrl && !inputName) || stage === "loading"}
            className="w-full py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {stage === "loading" ? "Enriching…" : "Enrich & Score"}
          </button>
        </div>

        {progress.length > 0 && (
          <div className="bg-zinc-900 rounded-xl p-4 space-y-1 font-mono text-xs">
            {progress.map((p, i) => (
              <div key={i} className={`${p.step === "error" ? "text-red-400" : "text-emerald-400"}`}>
                <span className="text-zinc-500">[{p.step}]</span> {p.message}
              </div>
            ))}
            {stage === "loading" && (
              <div className="text-zinc-500 animate-pulse">…</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (stage === "review" && result) {
    return (
      <div className="space-y-6">
        {/* Review form */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Review Extracted Data</h2>

          {[
            { key: "name", label: "Brand Name" },
            { key: "url", label: "URL" },
            { key: "country", label: "Country" },
            { key: "category", label: "Category" },
            { key: "positioning", label: "Positioning" },
            { key: "notes", label: "Notes" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-zinc-500 uppercase mb-1">{label}</label>
              <input
                type="text"
                value={String(editedBrand[key] ?? "")}
                onChange={(e) => setEditedBrand((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
          ))}
        </div>

        {/* Score preview */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <h3 className="text-sm font-semibold text-zinc-700">Estimated Scores (Balanced weights)</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-50 text-xs text-zinc-400 uppercase">
                <th className="text-left px-4 py-2">Marketplace</th>
                <th className="text-right px-4 py-2">Score</th>
                <th className="text-right px-4 py-2">Priority</th>
              </tr>
            </thead>
            <tbody>
              {result.scores.map((s) => (
                <tr key={s.marketplaceId} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{s.marketplaceName}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-700">{s.score.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <PriorityBadge priority={s.priority} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStage("form")}
            className="px-4 py-2.5 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Brand"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12 text-zinc-500">
      Brand saved! Redirecting…
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "";
  const cls = p.startsWith("P1")
    ? "bg-emerald-100 text-emerald-700"
    : p.startsWith("P2")
    ? "bg-blue-100 text-blue-700"
    : p.startsWith("P3")
    ? "bg-amber-100 text-amber-700"
    : "bg-zinc-100 text-zinc-500";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {p || "—"}
    </span>
  );
}
