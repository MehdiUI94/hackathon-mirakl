type Variant = "blue" | "green" | "amber" | "red" | "gray" | "purple";

const variantStyles: Record<Variant, { bg: string; color: string; border: string }> = {
  blue: {
    bg: "var(--mirakl-primary-background)",
    color: "var(--mirakl-primary-accent)",
    border: "rgba(39,100,255,0.16)",
  },
  green: {
    bg: "rgba(39,100,255,0.08)",
    color: "var(--mirakl-primary-dark)",
    border: "rgba(39,100,255,0.12)",
  },
  amber: {
    bg: "rgba(3,24,47,0.05)",
    color: "var(--mirakl-primary-dark)",
    border: "rgba(3,24,47,0.1)",
  },
  red: {
    bg: "var(--mirakl-secondary-background)",
    color: "var(--mirakl-secondary-dark)",
    border: "rgba(242,46,117,0.18)",
  },
  gray: {
    bg: "rgba(3,24,47,0.05)",
    color: "var(--mirakl-text-muted)",
    border: "rgba(3,24,47,0.08)",
  },
  purple: {
    bg: "rgba(119,0,49,0.08)",
    color: "var(--mirakl-secondary-dark)",
    border: "rgba(119,0,49,0.14)",
  },
};

export function PillTag({
  label,
  variant = "blue",
}: {
  label: string;
  variant?: Variant;
}) {
  const s = variantStyles[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 12,
        lineHeight: "18px",
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
      }}
    >
      {label}
    </span>
  );
}
