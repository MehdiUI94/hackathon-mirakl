import { getTranslations } from "next-intl/server";
import CampaignsDashboard from "@/components/CampaignsDashboard";

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("campaigns");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          {t("title")}
        </h1>
      </div>
      <CampaignsDashboard locale={locale} />
    </div>
  );
}
