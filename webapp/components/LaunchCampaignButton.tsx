"use client";

import { useState } from "react";
import { LaunchCampaignModal } from "./LaunchCampaignModal";

export function LaunchCampaignButton({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          background: isPressed ? "#143058" : isHovered ? "var(--color-primary-dark)" : "var(--color-primary)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          transform: isPressed ? "scale(0.97)" : "scale(1)",
          transition: "background 0.12s, transform 0.08s",
          fontFamily: "inherit",
          userSelect: "none",
        }}
      >
        <RocketIcon />
        Lancer la campagne
      </button>

      {open && <LaunchCampaignModal locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

function RocketIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
