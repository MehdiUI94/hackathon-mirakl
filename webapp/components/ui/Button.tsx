import { ButtonHTMLAttributes, ReactNode, useState } from "react";

type Variant = "primary" | "outline-primary" | "outline-danger" | "ghost";

const base: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--color-primary)", color: "#fff", border: "none" },
  "outline-primary": { background: "#fff", color: "var(--color-primary)", border: "1px solid var(--color-primary)" },
  "outline-danger": { background: "#fff", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" },
  ghost: { background: "transparent", color: "var(--color-text-secondary)", border: "none" },
};

const hovered: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--color-primary-dark)" },
  "outline-primary": { background: "var(--color-primary-light)" },
  "outline-danger": { background: "#FFF1F0", color: "#B91C1C", borderColor: "#FECACA" },
  ghost: { background: "rgba(0,0,0,0.05)", color: "var(--color-text-primary)" },
};

const pressed: Record<Variant, React.CSSProperties> = {
  primary: { background: "#143058", transform: "scale(0.97)" },
  "outline-primary": { background: "#D1E9FF", transform: "scale(0.97)" },
  "outline-danger": { background: "#FFE4E6", transform: "scale(0.97)" },
  ghost: { background: "rgba(0,0,0,0.1)", transform: "scale(0.97)" },
};

export function Button({
  variant = "primary",
  icon,
  children,
  disabled,
  className,
  style,
  ...props
}: {
  variant?: Variant;
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const interactionStyle = disabled
    ? {}
    : isPressed
    ? pressed[variant]
    : isHovered
    ? hovered[variant]
    : {};

  return (
    <button
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 0.12s, transform 0.08s, border-color 0.12s, color 0.12s",
        fontFamily: "inherit",
        userSelect: "none",
        ...base[variant],
        ...interactionStyle,
        ...style,
      }}
      disabled={disabled}
      className={className}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => !disabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      {...props}
    >
      {icon && <span style={{ width: 16, height: 16, display: "flex" }}>{icon}</span>}
      {children}
    </button>
  );
}
