import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { PillTag } from "@/components/ui/PillTag";
import { LaunchCampaignButton } from "@/components/LaunchCampaignButton";

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
    { label: t("totalBrands"), value: brands },
    { label: t("totalMarketplaces"), value: marketplaces },
    { label: t("campaignTargets"), value: targets },
    { label: t("emailsSent"), value: emailsSent },
    { label: t("meetingsBooked"), value: meetings },
    { label: t("replyRate"), value: `${replyRate}%` },
  ];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
            {t("subtitle")}
          </p>
        </div>
        <LaunchCampaignButton locale={locale} />
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
        className="kpi-grid"
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1,
                marginBottom: 6,
              }}
            >
              {k.value}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-text-secondary)",
                lineHeight: 1.3,
              }}
            >
              {k.label}
            </span>
          </div>
        ))}
      </div>

      {/* Top P1 brands */}
      <div>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-secondary)",
            margin: "0 0 12px",
          }}
        >
          {t("topPriority")}
        </h2>
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Brand", "Marketplace", "Score", "Priority"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: i >= 2 ? "right" : "left",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--color-text-secondary)",
                      background: "var(--color-bg)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topBrands.map((sl) => (
                <tr
                  key={sl.brandId + sl.marketplaceId}
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                  className="hover-row"
                >
                  <td style={{ padding: "12px 16px" }}>
                    <Link
                      href={`/${locale}/brands/${sl.brand.id}`}
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "var(--color-text-link)",
                        textDecoration: "none",
                      }}
                    >
                      {sl.brand.name}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--color-text-secondary)" }}>
                    {sl.marketplace.name}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "right",
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {sl.finalScore.toFixed(1)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <PriorityPill priority={sl.priority} />
                  </td>
                </tr>
              ))}
              {topBrands.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      fontSize: 14,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Aucune marque P1 — lancez le script de seed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .hover-row:hover { background: var(--color-primary-light); }
        .hover-row:last-child { border-bottom: none !important; }
      `}</style>
    </div>
  );
}

function PriorityPill({ priority }: { priority: string | null }) {
  const p = priority ?? "";
  const variant = p.startsWith("P1")
    ? "green"
    : p.startsWith("P2")
    ? "blue"
    : p.startsWith("P3")
    ? "amber"
    : "gray";
  return <PillTag label={p || "—"} variant={variant as "green" | "blue" | "amber" | "gray"} />;
}
