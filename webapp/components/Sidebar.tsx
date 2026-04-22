"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const NAV = [
  { key: "home", href: "/", num: "01" },
  { key: "inbox", href: "/inbox", num: "02" },
  { key: "brands", href: "/brands", num: "03" },
  { key: "campaigns", href: "/campaigns", num: "04" },
  { key: "settings", href: "/settings", num: "05" },
] as const;

export default function Sidebar({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}`), "") || "/";

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/drafts?status=PENDING");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setPendingCount(Array.isArray(data.drafts) ? data.drafts.length : 0);
      } catch {}
    }
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <aside className="w-[260px] flex-none border-r border-rule bg-paper flex flex-col relative z-20">
      {/* Brand mark */}
      <div className="px-7 pt-8 pb-6">
        <div className="eyebrow mb-2">N° 003 · Mirakl</div>
        <h1 className="font-display text-[26px] leading-[0.95] text-ink">
          Marketplace
          <br />
          <em className="text-ember">Growth</em> Engine
        </h1>
      </div>

      <div className="border-t border-rule mx-7" />

      {/* Nav */}
      <nav className="flex-1 px-7 py-6 space-y-0">
        {NAV.map(({ key, href, num }) => {
          const isActive =
            href === "/"
              ? pathWithoutLocale === "/"
              : pathWithoutLocale.startsWith(href);
          const showBadge = key === "inbox" && pendingCount > 0;
          return (
            <Link
              key={key}
              href={`/${locale}${href}`}
              className="group relative flex items-baseline gap-3 py-2.5 transition-colors"
            >
              {/* Active rule */}
              <span
                className={`absolute -left-7 top-1/2 -translate-y-1/2 w-3 h-px bg-ink transition-all ${
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-30"
                }`}
              />
              <span
                className={`font-mono text-[10px] tracking-widest tabular-nums ${
                  isActive ? "text-ink" : "text-muted/60 group-hover:text-muted"
                }`}
              >
                {num}
              </span>
              <span
                className={`flex-1 text-[14px] transition-colors ${
                  isActive
                    ? "text-ink font-medium"
                    : "text-muted group-hover:text-ink"
                }`}
              >
                {t(key)}
              </span>
              {showBadge && (
                <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 bg-ember text-paper rounded-sm">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer — locale switch */}
      <div className="px-7 py-5 border-t border-rule">
        <div className="eyebrow mb-2">Langue</div>
        <div className="flex items-baseline gap-3">
          <Link
            href={`/en${pathWithoutLocale}`}
            className={`text-[13px] transition-colors ${
              locale === "en" ? "text-ink font-medium" : "text-muted hover:text-ink"
            }`}
          >
            English
          </Link>
          <span className="text-muted/40">·</span>
          <Link
            href={`/fr${pathWithoutLocale}`}
            className={`text-[13px] transition-colors ${
              locale === "fr" ? "text-ink font-medium" : "text-muted hover:text-ink"
            }`}
          >
            Français
          </Link>
        </div>
      </div>
    </aside>
  );
}
