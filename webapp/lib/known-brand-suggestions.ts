export interface KnownBrandSuggestion {
  name: string;
  url: string;
  category: string;
}

export const KNOWN_BRAND_SUGGESTIONS: KnownBrandSuggestion[] = [
  { name: "Zara", url: "https://www.zara.com/fr/", category: "Womenswear RTW" },
  { name: "H&M", url: "https://www2.hm.com/fr_fr/index.html", category: "Womenswear RTW" },
  { name: "New Yorker", url: "https://www.newyorker.de/fr/", category: "Womenswear RTW" },
  { name: "Kiabi", url: "https://www.kiabi.com/", category: "Childrenswear" },
  { name: "Primark", url: "https://www.primark.com/fr-fr", category: "Womenswear RTW" },
  { name: "Uniqlo", url: "https://www.uniqlo.com/fr/fr/", category: "Menswear" },
  { name: "Mango", url: "https://shop.mango.com/fr", category: "Womenswear RTW" },
  { name: "C&A", url: "https://www.c-and-a.com/fr/fr/shop", category: "Womenswear RTW" },
  { name: "Bershka", url: "https://www.bershka.com/fr/", category: "Womenswear RTW" },
  { name: "Pull&Bear", url: "https://www.pullandbear.com/fr/", category: "Menswear" },
  { name: "Stradivarius", url: "https://www.stradivarius.com/fr/", category: "Womenswear RTW" },
  { name: "Massimo Dutti", url: "https://www.massimodutti.com/fr/", category: "Luxury" },
  { name: "COS", url: "https://www.cos.com/fr-fr/", category: "Womenswear RTW" },
  { name: "Arket", url: "https://www.arket.com/fr_fr/index.html", category: "Womenswear RTW" },
  { name: "Reserved", url: "https://www.reserved.com/fr/fr/", category: "Womenswear RTW" },
  { name: "Jennyfer", url: "https://www.jennyfer.com/", category: "Womenswear RTW" },
  { name: "Pimkie", url: "https://www.pimkie.fr/", category: "Womenswear RTW" },
  { name: "Jules", url: "https://www.jules.com/fr-fr/", category: "Menswear" },
  { name: "Celio", url: "https://www.celio.com/", category: "Menswear" },
  { name: "Brice", url: "https://www.brice.fr/", category: "Menswear" },
  { name: "Bonobo", url: "https://www.bonoboplanet.com/", category: "Menswear" },
  { name: "Cache Cache", url: "https://www.cache-cache.fr/", category: "Womenswear RTW" },
  { name: "Tally Weijl", url: "https://www.tally-weijl.com/fr_FR/", category: "Womenswear RTW" },
  { name: "Calzedonia", url: "https://www.calzedonia.com/fr/", category: "Accessories" },
  { name: "Intimissimi", url: "https://www.intimissimi.com/fr/", category: "Womenswear RTW" },
  { name: "Etam", url: "https://www.etam.com/", category: "Womenswear RTW" },
  { name: "Undiz", url: "https://www.undiz.com/", category: "Womenswear RTW" },
  { name: "Decathlon", url: "https://www.decathlon.fr/", category: "Sportswear" },
  { name: "Intersport", url: "https://www.intersport.fr/", category: "Sportswear" },
  { name: "Courir", url: "https://www.courir.com/fr/", category: "Sportswear" },
  { name: "JD Sports", url: "https://www.jdsports.fr/", category: "Sportswear" },
  { name: "Foot Locker", url: "https://www.footlocker.fr/", category: "Sportswear" },
  { name: "Go Sport", url: "https://www.go-sport.com/", category: "Sportswear" },
  { name: "Gémo", url: "https://www.gemo.fr/", category: "Childrenswear" },
  { name: "La Halle", url: "https://www.lahalle.com/", category: "Womenswear RTW" },
  { name: "Besson Chaussures", url: "https://www.besson-chaussures.com/", category: "Accessories" },
  { name: "Eram", url: "https://www.eram.fr/", category: "Accessories" },
  { name: "Minelli", url: "https://www.minelli.fr/", category: "Accessories" },
  { name: "Maisons du Monde", url: "https://www.maisonsdumonde.com/FR/fr", category: "Homewear" },
  { name: "IKEA", url: "https://www.ikea.com/fr/fr/", category: "Homewear" },
];

export function normalizeBrandText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSuggestionHostname(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const hostname = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
    return hostname.includes(".") ? hostname : "";
  } catch {
    return "";
  }
}
