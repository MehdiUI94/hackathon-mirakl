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
    <div style={{ padding: "24px 32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 24px" }}>
        {t("title")}
      </h1>
      <SettingsForm />
    </div>
  );
}
