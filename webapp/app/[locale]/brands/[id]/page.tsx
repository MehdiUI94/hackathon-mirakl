import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import BrandDetailClient from "@/components/BrandDetailClient";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("brands");

  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      scoringLines: {
        include: { marketplace: true },
        orderBy: { finalScore: "desc" },
      },
      recommendations: {
        orderBy: { rank: "asc" },
        include: { marketplace: true },
      },
      campaignTargets: {
        include: {
          marketplace: true,
          emailTemplates: {
            orderBy: { step: "asc" },
            take: 5,
          },
        },
      },
    },
  });

  if (!brand) notFound();

  const weightProfiles = await prisma.scoringWeights.findMany({
    orderBy: [{ isDefault: "desc" }, { profileName: "asc" }],
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/${locale}/brands`}
          className="text-sm text-zinc-400 hover:text-zinc-600 flex items-center gap-1 mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          {t("title")}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{brand.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
              {brand.country && <span>{brand.country}</span>}
              {brand.category && <span>· {brand.category}</span>}
              {brand.url && (
                <a
                  href={brand.url.startsWith("http") ? brand.url : `https://${brand.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline"
                >
                  {brand.url}
                </a>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
            brand.scoringLines[0]?.priority?.startsWith("P1") ? "bg-emerald-100 text-emerald-700" :
            brand.scoringLines[0]?.priority?.startsWith("P2") ? "bg-blue-100 text-blue-700" :
            brand.scoringLines[0]?.priority?.startsWith("P3") ? "bg-amber-100 text-amber-700" :
            "bg-zinc-100 text-zinc-600"
          }`}>
            {brand.scoringLines[0]?.priority ?? "—"}
          </span>
        </div>
      </div>

      <BrandDetailClient
        brand={{
          id: brand.id,
          name: brand.name,
          url: brand.url,
          country: brand.country,
          category: brand.category,
          positioning: brand.positioning,
          scoringLines: brand.scoringLines.map((sl) => ({
            marketplaceId: sl.marketplaceId,
            marketplaceName: sl.marketplace.name,
            finalScore: sl.finalScore,
            priority: sl.priority,
            alreadyPresent: sl.alreadyPresent,
            fitCategory: sl.fitCategory,
            fitGeo: sl.fitGeo,
            commercialScale: sl.commercialScale,
            opsReadiness: sl.opsReadiness,
            fitPositioning: sl.fitPositioning,
            incrementality: sl.incrementality,
            sustainabilityStory: sl.sustainabilityStory,
            baseCompletion: sl.baseCompletion,
            penalty: sl.penalty,
            initialPrior: sl.initialPrior,
          })),
          recommendations: brand.recommendations.map((r) => ({
            rank: r.rank,
            marketplaceName: r.marketplace.name,
            score: r.score,
            priority: r.priority,
            whyText: r.whyText,
            entryPlan: r.entryPlan,
            risks: r.risks,
            confidence: r.confidence,
          })),
          campaignTargets: brand.campaignTargets.map((ct) => ({
            id: ct.id,
            marketplaceId: ct.marketplaceId,
            marketplaceName: ct.marketplace.name,
            campaign: ct.campaign,
            contactRole: ct.contactRole,
            emailAngle: ct.emailAngle,
            emailTemplates: ct.emailTemplates.map((et) => ({
              id: et.id,
              step: et.step,
              subject: et.subject,
              bodyText: et.bodyText,
              branch: et.branch,
            })),
          })),
        }}
        weightProfiles={weightProfiles.map((w) => ({
          id: w.id,
          profileName: w.profileName,
          isDefault: w.isDefault,
          wCategory: w.wCategory,
          wGeo: w.wGeo,
          wScale: w.wScale,
          wOps: w.wOps,
          wPositioning: w.wPositioning,
          wIncrementality: w.wIncrementality,
          wStory: w.wStory,
          wPenalty: w.wPenalty,
          wPrior: w.wPrior,
        }))}
        locale={locale}
      />
    </div>
  );
}
