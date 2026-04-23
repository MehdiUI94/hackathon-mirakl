import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Roboto_Serif } from "next/font/google";
import { routing } from "@/i18n/routing";
import "../globals.css";
import Sidebar from "@/components/Sidebar";

const robotoSerif = Roboto_Serif({
  subsets: ["latin"],
  variable: "--font-roboto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Marketplace Growth Engine",
  description: "B2B outreach intelligence for fashion & lifestyle brands",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "en" | "fr")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className={`h-full antialiased ${robotoSerif.variable}`}>
      <body className="h-full flex bg-[var(--color-bg)] text-[var(--color-text-primary)]">
        <NextIntlClientProvider messages={messages}>
          <Sidebar locale={locale} />
          <main className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,_rgba(39,100,255,0.06),_transparent_32%),linear-gradient(180deg,_#F2F8FF_0%,_#FFFFFF_18%,_#F2F8FF_100%)]">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
