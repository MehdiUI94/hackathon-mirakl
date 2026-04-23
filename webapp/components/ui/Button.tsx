import { ButtonHTMLAttributes, ReactNode, useState } from "react";

type Variant = "primary" | "outline-primary" | "outline-danger" | "ghost";

const base: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--mirakl-primary-accent)",
    color: "#fff",
    border: "1px solid transparent",
    boxShadow: "var(--mirakl-shadow-soft)",
  },
  "outline-primary": {
    background: "#fff",
    color: "var(--mirakl-primary-dark)",
    border: "1px solid rgba(39,100,255,0.28)",
  },
  "outline-danger": {
    background: "#fff",
    color: "var(--mirakl-secondary-dark)",
    border: "1px solid rgba(242,46,117,0.26)",
  },
  ghost: {
    background: "transparent",
    color: "var(--mirakl-text-muted)",
    border: "1px solid transparent",
  },
};

const hovered: Record<Variant, React.CSSProperties> = {
  primary: { background: "#1e57ef" },
  "outline-primary": { background: "var(--mirakl-primary-background)", borderColor: "rgba(39,100,255,0.36)" },
  "outline-danger": {
    background: "var(--mirakl-secondary-background)",
    color: "var(--mirakl-secondary-dark)",
    borderColor: "rgba(242,46,117,0.38)",
  },
  ghost: { background: "rgba(3,24,47,0.05)", color: "var(--mirakl-primary-dark)" },
};

const pressed: Record<Variant, React.CSSProperties> = {
  primary: { background: "#1747c6", transform: "scale(0.985)" },
  "outline-primary": { background: "#e8f1ff", transform: "scale(0.985)" },
  "outline-danger": { background: "#ffdbe6", transform: "scale(0.985)" },
  ghost: { background: "rgba(3,24,47,0.1)", transform: "scale(0.985)" },
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
        justifyContent: "center",
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 14,
        lineHeight: "24px",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 0.12s, transform 0.08s, border-color 0.12s, color 0.12s, box-shadow 0.12s",
        fontFamily: "var(--font-roboto-serif), 'Roboto Serif', serif",
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
