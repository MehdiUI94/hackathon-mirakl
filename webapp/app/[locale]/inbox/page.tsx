import InboxClient from "@/components/InboxClient";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div style={{ minHeight: "100%" }}>
      <header
        style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--color-text-secondary)",
                  margin: "0 0 6px",
                }}
              >
                Validation des envois
              </p>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: "0 0 6px",
                }}
              >
                Boîte de réception
              </h1>
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0, maxWidth: 480 }}>
                Relisez les aperçus préparés par n8n, ajustez le ton si besoin,
                puis approuvez l&apos;envoi. Rien ne part sans votre validation.
              </p>
            </div>
            <div
              style={{
                textAlign: "right",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: 12,
                color: "var(--color-text-secondary)",
              }}
            >
              {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      </header>

      <div style={{ padding: "24px 32px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <InboxClient locale={locale} />
        </div>
      </div>
    </div>
  );
}
