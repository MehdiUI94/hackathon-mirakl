type Variant = "blue" | "green" | "amber" | "red" | "gray" | "purple";

const variantStyles: Record<Variant, { bg: string; color: string; border: string }> = {
  blue:   { bg: "#DBEAFE", color: "#1D4ED8", border: "#BFDBFE" },
  green:  { bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0" },
  amber:  { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  red:    { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" },
  gray:   { bg: "#F1F3F5", color: "#4B5563", border: "#E5E7EB" },
  purple: { bg: "#EDE9FE", color: "#5B21B6", border: "#DDD6FE" },
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
        fontWeight: 500,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
