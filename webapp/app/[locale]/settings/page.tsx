import { getTranslations } from "next-intl/server";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  const t = await getTranslations("settings");

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-zinc-900 mb-6">{t("title")}</h1>
      <SettingsForm />
    </div>
  );
}
