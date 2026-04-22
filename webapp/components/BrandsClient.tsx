"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface BrandRow {
  id: string;
  name: string;
  url: string | null;
  country: string | null;
  category: string | null;
  sourceGroup: string;
  bestScore: number | null;
  bestPriority: string | null;
  topMarketplace: string | null;
  createdVia: string;
}

export default function BrandsClient({ locale }: { locale: string }) {
  const t = useTranslations("brands");
  const router = useRouter();

  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [priority, setPriority] = useState("");

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (country) params.set("country", country);
    if (priority) params.set("priority", priority);
    params.set("take", "100");

    const res = await fetch(`/api/brands?${params}`);
    if (res.ok) {
      setBrands(await res.json());
    }
    setLoading(false);
  }, [q, category, country, priority]);

  useEffect(() => {
    const t = setTimeout(fetchBrands, 200);
    return () => clearTimeout(t);
  }, [fetchBrands]);

  return (
    <div>
      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          <option value="">{t("allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          <option value="">{t("allCountries")}</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          <option value="">{t("allPriorities")}</option>
          {["P1", "P2", "P3", "Watchlist"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Brand table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase tracking-wide">
              <th className="text-left px-4 py-3">{t("brand")}</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Country</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Category</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Top Marketplace</th>
              <th className="text-right px-4 py-3">{t("score")}</th>
              <th className="text-right px-4 py-3">{t("priority")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && brands.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  {t("noResults")}
                </td>
              </tr>
            )}
            {!loading &&
              brands.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => router.push(`/${locale}/brands/${b.id}`)}
                  className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{b.name}</div>
                    {b.url && (
                      <div className="text-xs text-zinc-400 truncate max-w-[180px]">
                        {b.url}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                    {b.country ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">
                    {b.category ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">
                    {b.topMarketplace ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-700">
                    {b.bestScore != null ? b.bestScore.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PriorityBadge priority={b.bestPriority} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {!loading && (
          <div className="px-4 py-2 border-t border-zinc-100 text-xs text-zinc-400">
            {brands.length} brands
          </div>
        )}
      </div>
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

const CATEGORIES = [
  "Fine Jewelry",
  "Womenswear RTW",
  "Menswear",
  "Accessories",
  "Outdoor",
  "Childrenswear",
  "Luxury",
  "Sportswear",
  "Homewear",
];

const COUNTRIES = [
  "USA",
  "France",
  "UK",
  "Italy",
  "Germany",
  "Australia",
  "Spain",
  "Denmark",
  "Sweden",
  "Netherlands",
];
