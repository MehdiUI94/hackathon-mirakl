"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const NAV = [
  { key: "home", href: "/", icon: HomeIcon },
  { key: "inbox", href: "/inbox", icon: InboxIcon },
  { key: "brands", href: "/brands", icon: BrandsIcon },
  { key: "campaigns", href: "/campaigns", icon: CampaignsIcon },
  { key: "settings", href: "/settings", icon: SettingsIcon },
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
        if (mounted) {
          setPendingCount(Array.isArray(data.drafts) ? data.drafts.length : 0);
        }
      } catch {
        // Ignore polling failures in the sidebar.
      }
    }

    poll();
    const id = setInterval(poll, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <aside
      style={{
        width: 224,
        background:
          "linear-gradient(180deg, rgba(3,24,47,1) 0%, rgba(7,31,60,0.98) 58%, rgba(20,40,73,1) 100%)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
      className="relative z-20 flex h-full flex-none flex-col"
    >
      <div className="px-6 pb-6 pt-8">
        <div
          className="mb-1 uppercase font-medium"
          style={{
            color: "rgba(255,255,255,0.58)",
            fontSize: 11,
            lineHeight: "16px",
            letterSpacing: "0.08em",
          }}
        >
          Mirakl Connect
        </div>
        <div
          style={{
            color: "#fff",
            fontSize: 22,
            lineHeight: "32px",
            fontWeight: 700,
            fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
          }}
        >
          Marketplace
          <br />
          Growth Engine
        </div>
      </div>

      <div style={{ height: 1, margin: "0 24px", background: "rgba(255,255,255,0.12)" }} />

      <div
        className="px-6 pb-3 pt-6 uppercase font-medium"
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          lineHeight: "16px",
          letterSpacing: "0.08em",
        }}
      >
        Navigation
      </div>

      <nav className="flex-1 space-y-1 px-4 pb-4">
        {NAV.map(({ key, href, icon: Icon }) => {
          const isActive =
            href === "/" ? pathWithoutLocale === "/" : pathWithoutLocale.startsWith(href);
          const showBadge = key === "inbox" && pendingCount > 0;

          return (
            <Link
              key={key}
              href={`/${locale}${href}`}
              className="group"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 8,
                textDecoration: "none",
                color: isActive ? "#fff" : "rgba(255,255,255,0.68)",
                background: isActive ? "rgba(39,100,255,0.22)" : "transparent",
                boxShadow: isActive ? "inset 0 0 0 1px rgba(255,255,255,0.12)" : "none",
                transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease",
                fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
                fontSize: 14,
                lineHeight: "24px",
                fontWeight: isActive ? 700 : 400,
              }}
            >
              <Icon
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  opacity: isActive ? 1 : 0.78,
                }}
              />
              <span className="flex-1">{t(key)}</span>
              {showBadge && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    padding: "1px 6px",
                    borderRadius: 9999,
                    background: "var(--mirakl-secondary-accent)",
                    color: "#fff",
                    fontSize: 10,
                    lineHeight: "16px",
                    fontWeight: 700,
                    fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
                  }}
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div
          className="mb-2 uppercase font-medium"
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 11,
            lineHeight: "16px",
            letterSpacing: "0.08em",
          }}
        >
          Langue
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/en${pathWithoutLocale}`}
            style={{
              color: locale === "en" ? "#fff" : "rgba(255,255,255,0.5)",
              fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
              fontSize: 14,
              lineHeight: "24px",
              fontWeight: locale === "en" ? 700 : 400,
              textDecoration: "none",
            }}
          >
            EN
          </Link>
          <span style={{ color: "rgba(255,255,255,0.24)" }}>·</span>
          <Link
            href={`/fr${pathWithoutLocale}`}
            style={{
              color: locale === "fr" ? "#fff" : "rgba(255,255,255,0.5)",
              fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
              fontSize: 14,
              lineHeight: "24px",
              fontWeight: locale === "fr" ? 700 : 400,
              textDecoration: "none",
            }}
          >
            FR
          </Link>
        </div>
      </div>
    </aside>
  );
}

function HomeIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function InboxIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function BrandsIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CampaignsIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function SettingsIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
