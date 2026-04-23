"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

interface ScoreResult {
  marketplaceId: string;
  marketplaceName: string;
  score: number;
  priority: string;
  benchmarkScore?: number | null;
  benchmarkMatchedBrands?: number;
  benchmarkConfidence?: string;
}

interface BrandData {
  name?: string;
  url?: string;
  country?: string;
  category?: string;
  foundedYear?: number | null;
  headquartersAddress?: string;
  companyType?: string;
  businessSignals?: string[];
  genderFocus?: string;
  productType?: string;
  productTags?: string[];
  revenueMUsd?: number | null;
  headcount?: number | null;
  intlPresence?: string;
  sustainable?: boolean;
  positioning?: string;
  sources?: string;
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

interface BrandSuggestion {
  name: string;
  url: string;
  category: string;
}

const REVIEW_FIELDS = [
  { key: "name", label: "Brand Name" },
  { key: "url", label: "URL" },
  { key: "country", label: "Country" },
  { key: "category", label: "Category" },
  { key: "foundedYear", label: "Founded Year" },
  { key: "headquartersAddress", label: "Headquarters" },
  { key: "companyType", label: "Company Type" },
  { key: "genderFocus", label: "Gender Focus" },
  { key: "productType", label: "Product Type" },
  { key: "positioning", label: "Positioning" },
  { key: "revenueMUsd", label: "Revenue ($M)" },
  { key: "headcount", label: "Employees" },
  { key: "intlPresence", label: "International Presence" },
  { key: "businessSignals", label: "Business Signals" },
  { key: "productTags", label: "Product Tags" },
  { key: "sources", label: "Sources" },
  { key: "notes", label: "Notes" },
] as const;

export default function AddBrandClient({ locale }: { locale: string }) {
  const t = useTranslations("brands");
  const router = useRouter();

  const [inputUrl, setInputUrl] = useState("");
  const [inputName, setInputName] = useState("");
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [stage, setStage] = useState<"form" | "loading" | "review" | "saved">("form");
  const [editedBrand, setEditedBrand] = useState<BrandData>({});
  const [brandSuggestions, setBrandSuggestions] = useState<BrandSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const query = inputName.trim();
    if (!query || stage !== "form") {
      setBrandSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/brands/suggestions?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: BrandSuggestion[]) => setBrandSuggestions(data))
        .catch(() => {
          if (!controller.signal.aborted) setBrandSuggestions([]);
        });
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [inputName, stage]);

  function handleUrlChange(value: string) {
    setInputUrl(value);
    const trimmed = value.trim();
    if (!trimmed) return;

    fetch(`/api/brands/suggestions?url=${encodeURIComponent(trimmed)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((suggestion: BrandSuggestion | null) => {
        if (suggestion && (!inputName || brandSuggestions.some((brand) => brand.name === inputName))) {
          setInputName(suggestion.name);
        }
      })
      .catch(() => undefined);
  }

  function handleNameChange(value: string) {
    setInputName(value);
    const known = brandSuggestions.find((brand) => brand.name === value);
    if (known) setInputUrl(known.url);
  }

  function selectSuggestion(brand: BrandSuggestion) {
    setInputName(brand.name);
    setInputUrl(brand.url);
    setBrandSuggestions([]);
  }

  async function handleEnrich() {
    if (!inputUrl && !inputName) return;
    setStage("loading");
    setProgress([]);
    setResult(null);
    setSaveError(null);

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
    setSaveError(null);

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedBrand.name ?? "Unnamed Brand",
          url: editedBrand.url ?? inputUrl,
          country: editedBrand.country ?? undefined,
          category: editedBrand.category ?? undefined,
          foundedYear: toNullableNumber(editedBrand.foundedYear),
          headquartersAddress: toOptionalString(editedBrand.headquartersAddress),
          companyType: toOptionalString(editedBrand.companyType),
          businessSignals: toStringList(editedBrand.businessSignals),
          genderFocus: toOptionalString(editedBrand.genderFocus),
          productType: toOptionalString(editedBrand.productType),
          positioning: editedBrand.positioning ?? undefined,
          revenueMUsd: toNullableNumber(editedBrand.revenueMUsd),
          headcount: toNullableInteger(editedBrand.headcount),
          intlPresence: toOptionalString(editedBrand.intlPresence),
          sustainable: Boolean(editedBrand.sustainable),
          productTags: toStringList(editedBrand.productTags),
          sources: toOptionalString(editedBrand.sources),
          notes: editedBrand.notes ?? undefined,
          createdVia: "ENRICHED",
        }),
      });

      if (!res.ok) {
        const errorPayload = await safeReadJson(res);
        setSaveError(extractErrorMessage(errorPayload) ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }

      const saved = await res.json();
      if (!saved?.id) {
        setSaveError("Brand saved but no brand id was returned.");
        setSaving(false);
        return;
      }

      setStage("saved");
      router.refresh();
      window.location.assign(`/${locale}/brands/${saved.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unexpected save failure");
      setSaving(false);
    }
  }

  if (stage === "form" || stage === "loading") {
    return (
      <div className="space-y-6">
        <div className="mirakl-card rise space-y-6 border border-[var(--mirakl-border)] p-8">
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(3,24,47,0.56)]">
              Brand URL
            </label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://example.com or example.com"
              disabled={stage === "loading"}
              className="w-full rounded-lg border border-[var(--mirakl-border)] bg-[var(--mirakl-surface-muted)] px-4 py-3 text-sm text-[var(--mirakl-primary-dark)] shadow-[inset_0_1px_2px_rgba(3,24,47,0.04)] outline-none transition focus:border-[rgba(39,100,255,0.5)] focus:bg-white focus:ring-2 focus:ring-[rgba(39,100,255,0.14)] disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-[var(--mirakl-border)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(3,24,47,0.44)]">
              or
            </span>
            <div className="flex-1 border-t border-[var(--mirakl-border)]" />
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(3,24,47,0.56)]">
              Brand Name
            </label>
            <input
              type="text"
              value={inputName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Sezane"
              disabled={stage === "loading"}
              className="w-full rounded-lg border border-[var(--mirakl-border)] bg-[var(--mirakl-surface-muted)] px-4 py-3 text-sm text-[var(--mirakl-primary-dark)] shadow-[inset_0_1px_2px_rgba(3,24,47,0.04)] outline-none transition focus:border-[rgba(39,100,255,0.5)] focus:bg-white focus:ring-2 focus:ring-[rgba(39,100,255,0.14)] disabled:opacity-50"
            />
            {inputName.trim() && brandSuggestions.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-[var(--mirakl-border)] bg-white shadow-[var(--mirakl-shadow-soft)]">
                {brandSuggestions.map((brand) => (
                  <button
                    key={brand.name}
                    type="button"
                    onClick={() => selectSuggestion(brand)}
                    disabled={stage === "loading"}
                    className="flex w-full items-center justify-between gap-3 border-b border-[var(--mirakl-border)] px-4 py-3 text-left text-sm last:border-b-0 hover:bg-[var(--mirakl-primary-background)] disabled:opacity-50"
                  >
                    <span className="font-bold text-[var(--mirakl-primary-dark)]">{brand.name}</span>
                    <span className="truncate text-xs text-[rgba(3,24,47,0.44)]">{brand.url}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleEnrich}
            disabled={(!inputUrl && !inputName) || stage === "loading"}
            className="w-full rounded-lg bg-[var(--mirakl-primary-accent)] px-4 py-3 text-sm font-bold text-white shadow-[var(--mirakl-shadow-soft)] transition hover:bg-[#1e57ef] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === "loading" ? "Enriching..." : "Enrich & Score"}
          </button>
        </div>

        {progress.length > 0 && (
          <div className="mirakl-card rise-2 space-y-2 border border-[rgba(3,24,47,0.08)] bg-[var(--mirakl-primary-dark)] p-5 text-xs text-white">
            {progress.map((p, i) => (
              <div
                key={i}
                className={p.step === "error" ? "text-[var(--mirakl-secondary-accent)]" : "text-white"}
              >
                <span className="mr-2 text-[rgba(255,255,255,0.48)]">[{p.step}]</span>
                {p.message}
              </div>
            ))}
            {stage === "loading" && (
              <div className="animate-pulse text-[rgba(255,255,255,0.48)]">...</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (stage === "review" && result) {
    return (
      <div className="space-y-6">
        <div className="mirakl-card rise border border-[var(--mirakl-border)] p-8">
          <h2 className="pb-4 text-[18px] font-bold leading-7 text-[var(--mirakl-primary-dark)]">
            Review Extracted Data
          </h2>

          {REVIEW_FIELDS.map(({ key, label }) => (
            <div key={key} className="mb-4 last:mb-0">
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(3,24,47,0.56)]">
                {label}
              </label>
              {key === "notes" || key === "sources" ? (
                <textarea
                  rows={key === "notes" ? 3 : 4}
                  value={stringifyFieldValue(editedBrand[key])}
                  onChange={(e) => setEditedBrand((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--mirakl-border)] bg-[var(--mirakl-surface-muted)] px-4 py-3 text-sm text-[var(--mirakl-primary-dark)] shadow-[inset_0_1px_2px_rgba(3,24,47,0.04)] outline-none transition focus:border-[rgba(39,100,255,0.5)] focus:bg-white focus:ring-2 focus:ring-[rgba(39,100,255,0.14)]"
                />
              ) : (
                <input
                  type={key === "foundedYear" || key === "revenueMUsd" || key === "headcount" ? "number" : "text"}
                  value={stringifyFieldValue(editedBrand[key])}
                  onChange={(e) =>
                    setEditedBrand((prev) => ({
                      ...prev,
                      [key]:
                        key === "businessSignals" || key === "productTags"
                          ? splitInputList(e.target.value)
                          : e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--mirakl-border)] bg-[var(--mirakl-surface-muted)] px-4 py-3 text-sm text-[var(--mirakl-primary-dark)] shadow-[inset_0_1px_2px_rgba(3,24,47,0.04)] outline-none transition focus:border-[rgba(39,100,255,0.5)] focus:bg-white focus:ring-2 focus:ring-[rgba(39,100,255,0.14)]"
                />
              )}
            </div>
          ))}

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(3,24,47,0.56)]">
              Sustainable
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--mirakl-text-muted)]">
              <input
                type="checkbox"
                checked={Boolean(editedBrand.sustainable)}
                onChange={(e) =>
                  setEditedBrand((prev) => ({ ...prev, sustainable: e.target.checked }))
                }
              />
              Sustainability / ethical signal detected
            </label>
          </div>
        </div>

        <div className="mirakl-card rise-2 overflow-hidden border border-[var(--mirakl-border)]">
          <div className="border-b border-[var(--mirakl-border)] px-6 py-4">
            <h3 className="text-[18px] font-bold leading-7 text-[var(--mirakl-primary-dark)]">
              Estimated Scores (Balanced weights)
            </h3>
          </div>
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--mirakl-border)]">
                <th className="px-4 py-2 text-left">Marketplace</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-right">Priority</th>
              </tr>
            </thead>
            <tbody>
              {result.scores.map((s) => (
                <tr key={s.marketplaceId} className="last:border-0">
                  <td className="px-4 py-2.5 font-bold text-[var(--mirakl-primary-dark)]">
                    {s.marketplaceName}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-[var(--mirakl-primary-dark)]">
                    {s.score.toFixed(1)}
                  </td>
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
            className="rounded-lg border border-[var(--mirakl-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--mirakl-primary-dark)] transition hover:bg-[var(--mirakl-primary-background)]"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-[var(--mirakl-primary-accent)] px-4 py-3 text-sm font-bold text-white shadow-[var(--mirakl-shadow-soft)] transition hover:bg-[#1e57ef] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Brand"}
          </button>
        </div>

        {saveError && (
          <div className="rounded-lg border border-[rgba(242,46,117,0.22)] bg-[var(--mirakl-secondary-background)] px-4 py-3 text-sm text-[var(--mirakl-secondary-dark)]">
            {saveError}
          </div>
        )}
      </div>
    );
  }

  return <div className="py-12 text-center text-[var(--mirakl-text-muted)]">Brand saved! Redirecting...</div>;
}

function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "";
  const cls = p.startsWith("P1")
    ? "bg-[var(--mirakl-primary-accent)] text-white"
    : p.startsWith("P2")
    ? "bg-[var(--mirakl-primary-background)] text-[var(--mirakl-primary-accent)]"
    : p.startsWith("P3")
    ? "bg-[rgba(3,24,47,0.08)] text-[var(--mirakl-primary-dark)]"
    : "bg-[rgba(3,24,47,0.05)] text-[var(--mirakl-text-muted)]";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${cls}`}
    >
      {p || "Watchlist"}
    </span>
  );
}

function stringifyFieldValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  return String(value);
}

function splitInputList(value: string) {
  return value
    .split(/[,;\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return splitInputList(value);
  return [];
}

function toOptionalString(value: unknown) {
  const normalized = stringifyFieldValue(value).trim();
  return normalized ? normalized : undefined;
}

function toNullableNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toNullableInteger(value: unknown) {
  const number = toNullableNumber(value);
  return number == null ? undefined : Math.round(number);
}

async function safeReadJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;

  if (record.error && typeof record.error === "object") {
    const errorRecord = record.error as Record<string, unknown>;
    const formErrors = Array.isArray(errorRecord.formErrors) ? errorRecord.formErrors : [];
    if (formErrors.length > 0) {
      return String(formErrors[0]);
    }

    if (errorRecord.fieldErrors && typeof errorRecord.fieldErrors === "object") {
      const fieldErrors = errorRecord.fieldErrors as Record<string, unknown>;
      const firstFieldError = Object.entries(fieldErrors).find(
        ([, value]) => Array.isArray(value) && value.length > 0
      );
      if (firstFieldError) {
        const [field, messages] = firstFieldError;
        return `${field}: ${String((messages as unknown[])[0])}`;
      }
    }
  }

  return null;
}
