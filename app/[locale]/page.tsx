import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("home");

  const [brands, marketplaces, targets, emailsSent, meetings] = await Promise.all([
    prisma.brand.count(),
    prisma.marketplace.count(),
    prisma.campaignTarget.count({ where: { stopped: false } }),
    prisma.emailSend.count({ where: { status: "SENT" } }),
    prisma.emailSend.count({ where: { meetingBooked: true } }),
  ]);

  const replies = await prisma.emailSend.count({ where: { replyAt: { not: null } } });
  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 1000) / 10 : 0;

  const topBrands = await prisma.scoringLine.findMany({
    where: { priority: { startsWith: "P1" } },
    orderBy: { finalScore: "desc" },
    take: 8,
    include: { brand: true, marketplace: true },
    distinct: ["brandId"],
  });

  const kpis = [
    { label: t("totalBrands"), value: brands, color: "bg-indigo-50 text-indigo-700" },
    { label: t("totalMarketplaces"), value: marketplaces, color: "bg-violet-50 text-violet-700" },
    { label: t("campaignTargets"), value: targets, color: "bg-blue-50 text-blue-700" },
    { label: t("emailsSent"), value: emailsSent, color: "bg-sky-50 text-sky-700" },
    { label: t("meetingsBooked"), value: meetings, color: "bg-emerald-50 text-emerald-700" },
    { label: t("replyRate"), value: `${replyRate}%`, color: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
        <p className="text-sm text-zinc-500 mt-1">{t("subtitle")}</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl p-4 flex flex-col items-center ${k.color}`}
          >
            <span className="text-2xl font-bold">{k.value}</span>
            <span className="text-xs mt-1 text-center leading-tight opacity-80">
              {k.label}
            </span>
          </div>
        ))}
      </div>

      {/* Top P1 brands */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide mb-3">
          {t("topPriority")}
        </h2>
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Brand</th>
                <th className="text-left px-4 py-3">Marketplace</th>
                <th className="text-right px-4 py-3">Score</th>
                <th className="text-right px-4 py-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {topBrands.map((sl) => (
                <tr
                  key={sl.brandId + sl.marketplaceId}
                  className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/brands/${sl.brand.id}`}
                      className="font-medium text-zinc-900 hover:text-indigo-600"
                    >
                      {sl.brand.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{sl.marketplace.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-700">
                    {sl.finalScore.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PriorityBadge priority={sl.priority} />
                  </td>
                </tr>
              ))}
              {topBrands.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-400 text-sm">
                    No P1 brands yet — run the seed script.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
