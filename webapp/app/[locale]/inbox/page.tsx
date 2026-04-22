import InboxClient from "@/components/InboxClient";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="min-h-full">
      {/* Editorial masthead */}
      <header className="px-12 pt-14 pb-10 border-b border-rule">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between">
            <div className="rise">
              <div className="eyebrow mb-3">Section II · Validation des envois</div>
              <h1 className="font-display text-[68px] leading-[0.92] text-ink">
                Boîte de <em className="text-ember">réception</em>
              </h1>
              <p className="mt-4 max-w-md text-[15px] text-muted leading-relaxed">
                Relisez les aperçus préparés par n8n, ajustez le ton si besoin,
                puis approuvez l'envoi. Rien ne part sans votre validation.
              </p>
            </div>
            <div className="hidden lg:block text-right rise rise-2">
              <div className="eyebrow mb-1">Édition</div>
              <div className="font-display italic text-3xl text-ink">
                {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </div>
              <div className="font-mono text-[10px] tracking-widest text-muted mt-1">
                {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="px-12 py-10">
        <div className="max-w-6xl mx-auto">
          <InboxClient locale={locale} />
        </div>
      </div>
    </div>
  );
}
