"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { computeScore, priorityFromScore, type ScoringWeightsInput } from "@/lib/scoring";

interface ScoringLine {
  marketplaceId: string;
  marketplaceName: string;
  finalScore: number;
  priority: string | null;
  alreadyPresent: boolean;
  fitCategory: number;
  fitGeo: number;
  commercialScale: number;
  opsReadiness: number;
  fitPositioning: number;
  incrementality: number;
  sustainabilityStory: number;
  baseCompletion: number;
  penalty: number;
  initialPrior: number;
}

interface Recommendation {
  rank: number;
  marketplaceName: string;
  score: number;
  priority: string | null;
  whyText: string | null;
  entryPlan: string | null;
  risks: string | null;
  confidence: string | null;
}

interface EmailTemplate {
  id: string;
  step: number;
  subject: string;
  bodyText: string;
  branch: string | null;
}

interface CampaignTarget {
  id: string;
  marketplaceId: string;
  marketplaceName: string;
  campaign: string;
  contactRole: string | null;
  emailAngle: string | null;
  emailTemplates: EmailTemplate[];
}

interface BrandData {
  id: string;
  name: string;
  url: string | null;
  country: string | null;
  category: string | null;
  positioning: string | null;
  scoringLines: ScoringLine[];
  recommendations: Recommendation[];
  campaignTargets: CampaignTarget[];
}

interface WeightProfile {
  id: string;
  profileName: string;
  isDefault: boolean;
  wCategory: number;
  wGeo: number;
  wScale: number;
  wOps: number;
  wPositioning: number;
  wIncrementality: number;
  wStory: number;
  wPenalty: number;
  wPrior: number;
}

interface Props {
  brand: BrandData;
  weightProfiles: WeightProfile[];
  locale: string;
}

type Tab = "scoring" | "recommendations" | "email";

export default function BrandDetailClient({ brand, weightProfiles, locale }: Props) {
  const t = useTranslations("brands");
  const defaultProfile = weightProfiles.find((p) => p.isDefault) ?? weightProfiles[0];

  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfile?.id ?? "");
  const [tab, setTab] = useState<Tab>("scoring");
  const [weights, setWeights] = useState<ScoringWeightsInput>(() => profileToWeights(defaultProfile));
  const [liveScores, setLiveScores] = useState<ScoringLine[]>(brand.scoringLines);
  const [emailTarget, setEmailTarget] = useState<CampaignTarget | null>(
    brand.campaignTargets[0] ?? null
  );
  const [toEmail, setToEmail] = useState("");
  const [toFirstName, setToFirstName] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function profileToWeights(p: WeightProfile | undefined): ScoringWeightsInput {
    if (!p) return { wCategory: 30, wGeo: 12, wScale: 15, wOps: 13, wPositioning: 12, wIncrementality: 8, wStory: 5, wPenalty: 0, wPrior: 10 };
    return {
      wCategory: p.wCategory, wGeo: p.wGeo, wScale: p.wScale, wOps: p.wOps,
      wPositioning: p.wPositioning, wIncrementality: p.wIncrementality,
      wStory: p.wStory, wPenalty: p.wPenalty, wPrior: p.wPrior,
    };
  }

  // Recompute scores client-side on weight change (< 100ms, no network)
  const recomputeScores = useCallback(
    (w: ScoringWeightsInput) => {
      const updated = brand.scoringLines.map((sl) => {
        const score = computeScore(sl, w);
        return { ...sl, finalScore: score, priority: priorityFromScore(score) };
      });
      updated.sort((a, b) => b.finalScore - a.finalScore);
      setLiveScores(updated);
    },
    [brand.scoringLines]
  );

  const handleWeightChange = useCallback(
    (key: keyof ScoringWeightsInput, value: number) => {
      const next = { ...weights, [key]: value };
      setWeights(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => recomputeScores(next), 30);
    },
    [weights, recomputeScores]
  );

  const handleProfileChange = useCallback(
    (profileId: string) => {
      setSelectedProfileId(profileId);
      const profile = weightProfiles.find((p) => p.id === profileId);
      if (profile) {
        const w = profileToWeights(profile);
        setWeights(w);
        recomputeScores(w);
      }
    },
    [weightProfiles, recomputeScores]
  );

  async function handleSend() {
    if (!emailTarget || !toEmail) return;
    setSendStatus("sending");
    const step1Template = emailTarget.emailTemplates.find((et) => et.step === 1);
    const res = await fetch("/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        marketplaceId: emailTarget.marketplaceId,
        emailTemplateId: step1Template?.id,
        toEmail,
        toFirstName: toFirstName || undefined,
      }),
    });
    setSendStatus(res.ok ? "sent" : "error");
    setTimeout(() => setSendStatus("idle"), 3000);
  }

  const topScore = liveScores[0];
  const step1 = emailTarget?.emailTemplates.find((et) => et.step === 1);

  const WEIGHT_FIELDS: { key: keyof ScoringWeightsInput; label: string }[] = [
    { key: "wCategory", label: t("fitCategory") },
    { key: "wGeo", label: t("fitGeo") },
    { key: "wScale", label: t("commercialScale") },
    { key: "wOps", label: t("opsReadiness") },
    { key: "wPositioning", label: t("fitPositioning") },
    { key: "wIncrementality", label: t("incrementality") },
    { key: "wStory", label: t("sustainabilityStory") },
  ];

  return (
    <div className="space-y-6">
      {/* Strategy selector + top score cards */}
      <div className="flex items-center gap-4 p-4 bg-white border border-zinc-200 rounded-xl">
        <div className="flex-1">
          <label className="text-xs text-zinc-400 font-medium uppercase tracking-wide block mb-1">
            {t("strategy")}
          </label>
          <select
            value={selectedProfileId}
            onChange={(e) => handleProfileChange(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          >
            {weightProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.profileName} {p.isDefault ? "(default)" : ""}
              </option>
            ))}
          </select>
        </div>

        {liveScores.slice(0, 2).map((sl) => (
          <div
            key={sl.marketplaceId}
            className="text-center px-4 py-2 rounded-lg bg-zinc-50 border border-zinc-200 min-w-[110px]"
          >
            <div className="text-2xl font-bold text-zinc-900">{sl.finalScore.toFixed(1)}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{sl.marketplaceName}</div>
            <PriorityBadge priority={sl.priority} />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200">
        <div className="flex gap-0">
          {(["scoring", "recommendations", "email"] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === tabKey
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tabKey === "scoring"
                ? t("scoringBreakdown")
                : tabKey === "recommendations"
                ? t("recommendations")
                : t("emailPreview")}
            </button>
          ))}
        </div>
      </div>

      {/* Scoring tab */}
      {tab === "scoring" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live reweight sliders */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-700 mb-4">{t("liveReweight")}</h3>
            <div className="space-y-3">
              {WEIGHT_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>{label}</span>
                    <span className="font-mono font-medium text-zinc-700">{weights[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={weights[key] as number}
                    onChange={(e) => handleWeightChange(key, parseInt(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Scoring table */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Marketplace</th>
                  <th className="text-right px-4 py-3">Score</th>
                  <th className="text-right px-4 py-3">Priority</th>
                </tr>
              </thead>
              <tbody>
                {liveScores.map((sl) => (
                  <tr
                    key={sl.marketplaceId}
                    className="border-b border-zinc-50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {sl.marketplaceName}
                      {sl.alreadyPresent && (
                        <span className="ml-2 text-xs text-zinc-400">({t("alreadyPresent")})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-700">
                      {sl.finalScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PriorityBadge priority={sl.priority} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommendations tab */}
      {tab === "recommendations" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brand.recommendations.map((rec) => (
            <div
              key={rec.rank}
              className="bg-white border border-zinc-200 rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-zinc-400 uppercase tracking-wide">
                    Rank #{rec.rank}
                  </span>
                  <h3 className="text-base font-semibold text-zinc-900 mt-0.5">
                    {rec.marketplaceName}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-zinc-900">
                    {rec.score.toFixed(1)}
                  </div>
                  <PriorityBadge priority={rec.priority} />
                </div>
              </div>

              {rec.whyText && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-zinc-400 uppercase mb-1">Why</div>
                  <p className="text-sm text-zinc-600 leading-relaxed">{rec.whyText}</p>
                </div>
              )}
              {rec.entryPlan && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-zinc-400 uppercase mb-1">Entry Plan</div>
                  <p className="text-sm text-zinc-600 leading-relaxed">{rec.entryPlan}</p>
                </div>
              )}
              {rec.risks && (
                <div>
                  <div className="text-xs font-medium text-zinc-400 uppercase mb-1">Risks</div>
                  <p className="text-sm text-zinc-500 leading-relaxed">{rec.risks}</p>
                </div>
              )}
            </div>
          ))}
          {brand.recommendations.length === 0 && (
            <div className="col-span-2 text-center py-10 text-zinc-400 bg-white border border-zinc-200 rounded-xl">
              No recommendations available
            </div>
          )}
        </div>
      )}

      {/* Email preview tab */}
      {tab === "email" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-700">{t("emailPreview")}</h3>

            {brand.campaignTargets.length > 0 && (
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Target</label>
                <select
                  value={emailTarget?.id ?? ""}
                  onChange={(e) => {
                    const ct = brand.campaignTargets.find((t) => t.id === e.target.value);
                    setEmailTarget(ct ?? null);
                  }}
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 focus:outline-none"
                >
                  {brand.campaignTargets.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.marketplaceName} — {ct.campaign}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-zinc-400 block mb-1">To Email</label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="contact@brand.com"
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">First Name</label>
              <input
                type="text"
                value={toFirstName}
                onChange={(e) => setToFirstName(e.target.value)}
                placeholder="Sarah"
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={!toEmail || sendStatus === "sending"}
              className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                sendStatus === "sent"
                  ? "bg-emerald-600 text-white"
                  : sendStatus === "error"
                  ? "bg-red-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              {sendStatus === "sending"
                ? "Sending…"
                : sendStatus === "sent"
                ? t("sendSuccess")
                : sendStatus === "error"
                ? t("sendError")
                : t("sendToN8n")}
            </button>
          </div>

          {/* Email preview */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            {step1 ? (
              <div>
                <div className="mb-3 pb-3 border-b border-zinc-100">
                  <div className="text-xs text-zinc-400 mb-1">{t("step1Subject")}</div>
                  <div className="text-sm font-medium text-zinc-900">
                    {replaceVars(step1.subject, toFirstName, brand.name, emailTarget?.marketplaceName ?? "")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400 mb-2">{t("step1Body")}</div>
                  <div className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                    {replaceVars(step1.bodyText, toFirstName, brand.name, emailTarget?.marketplaceName ?? "")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-zinc-400 text-sm">
                {t("notConfigured")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function replaceVars(text: string, firstName: string, brand: string, marketplace: string) {
  return text
    .replace(/{{first_name}}/gi, firstName || "there")
    .replace(/{{brand}}/gi, brand)
    .replace(/{{marketplace}}/gi, marketplace);
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
