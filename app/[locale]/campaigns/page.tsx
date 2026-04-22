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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
      </div>
      <CampaignsDashboard locale={locale} />
    </div>
  );
}
