type Tab = { key: string; label: string; count?: number };

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      style={{
        borderBottom: "1px solid var(--mirakl-border)",
        display: "flex",
        gap: 8,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: "12px 16px",
              fontSize: 14,
              lineHeight: "24px",
              fontWeight: isActive ? 700 : 400,
              color: isActive ? "var(--mirakl-primary-dark)" : "var(--mirakl-text-muted)",
              background: isActive ? "rgba(39,100,255,0.06)" : "transparent",
              border: "none",
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              borderBottom: isActive
                ? "2px solid var(--mirakl-primary-accent)"
                : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.12s ease",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  background: isActive
                    ? "var(--mirakl-primary-background)"
                    : "rgba(3,24,47,0.05)",
                  color: isActive
                    ? "var(--mirakl-primary-accent)"
                    : "var(--mirakl-text-muted)",
                  fontSize: 11,
                  lineHeight: "16px",
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 9999,
                  fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
