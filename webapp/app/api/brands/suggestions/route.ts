import { prisma } from "@/lib/db";
import {
  getSuggestionHostname,
  KNOWN_BRAND_SUGGESTIONS,
  normalizeBrandText,
} from "@/lib/known-brand-suggestions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const url = searchParams.get("url") ?? "";

  const existingBrands = await prisma.brand.findMany({
    select: { name: true },
  });
  const existingNames = new Set(existingBrands.map((brand) => normalizeBrandText(brand.name)));

  if (url.trim()) {
    const inferred = inferBrandFromUrl(url);
    if (!inferred || existingNames.has(normalizeBrandText(inferred.name))) {
      return NextResponse.json(null);
    }
    return NextResponse.json(inferred);
  }

  const normalizedQuery = normalizeBrandText(q);
  if (!normalizedQuery) return NextResponse.json([]);

  const suggestions = KNOWN_BRAND_SUGGESTIONS
    .filter((brand) => !existingNames.has(normalizeBrandText(brand.name)))
    .filter((brand) => normalizeBrandText(brand.name).includes(normalizedQuery))
    .sort((a, b) => {
      const aName = normalizeBrandText(a.name);
      const bName = normalizeBrandText(b.name);
      const aStarts = aName.startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = bName.startsWith(normalizedQuery) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, 8);

  return NextResponse.json(suggestions);
}

function inferBrandFromUrl(value: string) {
  const hostname = getSuggestionHostname(value);
  if (!hostname) return null;

  const known = KNOWN_BRAND_SUGGESTIONS.find(
    (brand) => getSuggestionHostname(brand.url) === hostname
  );
  if (known) return known;

  const name = hostname
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return {
    name,
    url: value.trim().startsWith("http") ? value.trim() : `https://${value.trim()}`,
    category: "",
  };
}
