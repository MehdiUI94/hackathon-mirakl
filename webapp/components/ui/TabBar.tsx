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
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        gap: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: "none",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--color-primary)"
                : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.12s",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  background: isActive ? "var(--color-primary-light)" : "var(--color-tag-gray-bg)",
                  color: isActive ? "var(--color-primary)" : "var(--color-text-secondary)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "1px 7px",
                  borderRadius: 9999,
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
