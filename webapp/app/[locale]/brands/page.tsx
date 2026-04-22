import { getTranslations } from "next-intl/server";
import Link from "next/link";
import BrandsClient from "@/components/BrandsClient";

export default async function BrandsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("brands");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          {t("title")}
        </h1>
        <Link
          href={`/${locale}/brands/new`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("addBrand")}
        </Link>
      </div>

      <BrandsClient locale={locale} />
    </div>
  );
}
