import { getTranslations } from "next-intl/server";
import Link from "next/link";
import AddBrandClient from "@/components/AddBrandClient";

export default async function AddBrandPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("brands");

  return (
    <div className="p-6 max-w-2xl mx-auto">
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
        <h1 className="text-2xl font-semibold text-zinc-900">{t("addBrand")}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Enter a brand URL or name to auto-enrich from the web and score it.
        </p>
      </div>
      <AddBrandClient locale={locale} />
    </div>
  );
}
