"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Brand {
  id: string;
  name: string;
  country: string | null;
  category: string | null;
  bestScore: number | null;
  bestPriority: string | null;
  topMarketplace: string | null;
}

interface BrandContact {
  brandId: string;
  brandName: string;
  marketplaceName: string;
  toEmail: string;
  toFirstName: string;
}

interface Props {
  locale: string;
  onClose: () => void;
}

export function LaunchCampaignModal({ locale, onClose }: Props) {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, BrandContact>>(new Map());
  const [campaignName, setCampaignName] = useState("Campagne Test");
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    fetch("/api/brands?take=100")
      .then((r) => r.json())
      .then((data) => { setBrands(data); setLoadingBrands(false); })
      .catch(() => setLoadingBrands(false));
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = brands.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (b.topMarketplace ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggleBrand(b: Brand) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(b.id)) {
        next.delete(b.id);
      } else {
        next.set(b.id, {
          brandId: b.id,
          brandName: b.name,
          marketplaceName: b.topMarketplace ?? "Mirakl",
          toEmail: "",
          toFirstName: "",
        });
      }
      return next;
    });
  }

  function updateContact(brandId: string, field: "toEmail" | "toFirstName" | "marketplaceName", value: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(brandId);
      if (entry) next.set(brandId, { ...entry, [field]: value });
      return next;
    });
  }

  const contacts = Array.from(selected.values());
  const canLaunch = contacts.length > 0 && contacts.every((c) => c.toEmail.trim() !== "") && !launching;

  async function launch() {
    setLaunching(true);
    setResult(null);
    try {
      const res = await fetch("/api/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: campaignName,
          testMode: false,
          targets: contacts.map((c) => ({
            brandName: c.brandName,
            toEmail: c.toEmail,
            toFirstName: c.toFirstName || undefined,
            marketplaceName: c.marketplaceName,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({
          type: data.n8nOk ? "success" : "info",
          text: data.message ?? "Campagne lancée",
        });
        setTimeout(() => {
          onClose();
          router.push(`/${locale}/inbox`);
        }, 1600);
      } else {
        setResult({ type: "error", text: data.error ?? "Échec du lancement" });
        setLaunching(false);
      }
    } catch {
      setResult({ type: "error", text: "Erreur réseau" });
      setLaunching(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="relative w-full bg-white border border-zinc-200 shadow-2xl flex flex-col"
        style={{ maxWidth: 900, maxHeight: "90vh", borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-100">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Lancer une campagne</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Sélectionnez les marques à contacter, renseignez les coordonnées, puis lancez.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 active:opacity-60 transition-all rounded-lg hover:bg-zinc-100"
          >
            <svg width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — brand picker */}
          <div className="flex flex-col w-1/2 border-r border-zinc-100" style={{ minWidth: 0 }}>
            <div className="px-5 py-3 border-b border-zinc-100">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une marque…"
                className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingBrands && (
                <div className="px-5 py-10 text-center text-sm text-zinc-400">Chargement…</div>
              )}
              {!loadingBrands && filtered.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-zinc-400">Aucune marque trouvée</div>
              )}
              {!loadingBrands && filtered.map((b) => {
                const isSelected = selected.has(b.id);
                return (
                  <label
                    key={b.id}
                    className={`flex items-start gap-3 px-5 py-3 cursor-pointer border-b border-zinc-50 transition-colors ${
                      isSelected ? "bg-indigo-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`relative mt-0.5 flex-shrink-0 w-4 h-4 border rounded transition-colors ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-zinc-300"
                      }`}
                    >
                      {isSelected && (
                        <svg className="absolute inset-0 w-full h-full text-white p-[2px]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
                        </svg>
                      )}
                      <input type="checkbox" checked={isSelected} onChange={() => toggleBrand(b)} className="sr-only" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-900 truncate">{b.name}</span>
                        {b.bestPriority && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                            b.bestPriority.startsWith("P1") ? "bg-emerald-100 text-emerald-700" :
                            b.bestPriority.startsWith("P2") ? "bg-blue-100 text-blue-700" :
                            "bg-zinc-100 text-zinc-500"
                          }`}>{b.bestPriority}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {b.topMarketplace && (
                          <span className="text-xs text-zinc-400">{b.topMarketplace}</span>
                        )}
                        {b.category && (
                          <span className="text-xs text-zinc-300">·</span>
                        )}
                        {b.category && (
                          <span className="text-xs text-zinc-400 truncate">{b.category}</span>
                        )}
                        {b.bestScore != null && (
                          <>
                            <span className="text-xs text-zinc-300">·</span>
                            <span className="text-xs font-mono text-zinc-400">{b.bestScore.toFixed(1)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="px-5 py-2 border-t border-zinc-100 text-xs text-zinc-400">
              {filtered.length} marque{filtered.length > 1 ? "s" : ""} · {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
            </div>
          </div>

          {/* Right — campaign config + contact details */}
          <div className="flex flex-col w-1/2 overflow-y-auto">
            {/* Campaign name */}
            <div className="px-6 py-5 border-b border-zinc-100">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Nom de la campagne
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
            </div>

            {/* Contact details per selected brand */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {contacts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-3xl mb-3 opacity-30">←</div>
                  <p className="text-sm text-zinc-400">
                    Sélectionnez des marques pour<br />configurer les destinataires.
                  </p>
                </div>
              )}
              {contacts.map((c) => (
                <div key={c.brandId} className="border border-zinc-100 rounded-xl p-4 bg-zinc-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-zinc-900">{c.brandName}</span>
                    <button
                      onClick={() => toggleBrand(brands.find((b) => b.id === c.brandId)!)}
                      className="text-zinc-300 hover:text-rose-500 transition-colors"
                      title="Retirer"
                    >
                      <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                        Email du contact <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={c.toEmail}
                        onChange={(e) => updateContact(c.brandId, "toEmail", e.target.value)}
                        placeholder="contact@marque.com"
                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                          Prénom
                        </label>
                        <input
                          type="text"
                          value={c.toFirstName}
                          onChange={(e) => updateContact(c.brandId, "toFirstName", e.target.value)}
                          placeholder="Sophie"
                          className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                          Marketplace
                        </label>
                        <input
                          type="text"
                          value={c.marketplaceName}
                          onChange={(e) => updateContact(c.brandId, "marketplaceName", e.target.value)}
                          className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Result message */}
            {result && (
              <div className={`mx-6 mb-2 px-4 py-3 rounded-lg text-sm border ${
                result.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                result.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" :
                "bg-blue-50 border-blue-200 text-blue-800"
              }`}>
                {result.text}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 bg-zinc-50/50 rounded-b-2xl">
          <div className="text-sm text-zinc-400">
            {contacts.length > 0 && contacts.some((c) => !c.toEmail) && (
              <span className="text-amber-600 font-medium">Renseignez l&apos;email de chaque marque sélectionnée.</span>
            )}
            {contacts.length === 0 && (
              <span>Sélectionnez au moins une marque.</span>
            )}
            {contacts.length > 0 && contacts.every((c) => c.toEmail) && !launching && !result && (
              <span className="text-zinc-500">
                {contacts.length} marque{contacts.length > 1 ? "s" : ""} · envoi via n8n
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 active:opacity-60 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={launch}
              disabled={!canLaunch}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all shadow-sm"
            >
              {launching ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Lancement…
                </>
              ) : (
                <>
                  <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                  Lancer la campagne
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
