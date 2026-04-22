"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Settings {
  n8nWebhookUrl: string;
  n8nWebhookSecret: string;
  defaultSenderName: string;
  defaultSenderEmail: string;
  llmProvider: string;
  llmApiKey: string;
  searchProvider: string;
  searchApiKey: string;
}

export default function SettingsForm() {
  const t = useTranslations("settings");
  const [settings, setSettings] = useState<Settings>({
    n8nWebhookUrl: "",
    n8nWebhookSecret: "",
    defaultSenderName: "",
    defaultSenderEmail: "",
    llmProvider: "",
    llmApiKey: "",
    searchProvider: "",
    searchApiKey: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [btnHovered, setBtnHovered] = useState(false);
  const [btnPressed, setBtnPressed] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  function update(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setStatus(res.ok ? "saved" : "error");
    setTimeout(() => setStatus("idle"), 2000);
  }

  const fields: { key: keyof Settings; label: string; type?: string; placeholder?: string }[] = [
    { key: "n8nWebhookUrl", label: t("n8nWebhookUrl"), placeholder: "https://your-n8n.cloud/webhook/..." },
    { key: "n8nWebhookSecret", label: t("n8nWebhookSecret"), type: "password", placeholder: "secret" },
    { key: "defaultSenderName", label: t("defaultSenderName"), placeholder: "Mehdi Zitouni" },
    { key: "defaultSenderEmail", label: t("defaultSenderEmail"), type: "email", placeholder: "mehdi@mirakl.com" },
    { key: "llmProvider", label: t("llmProvider"), placeholder: "anthropic" },
    { key: "llmApiKey", label: t("llmApiKey"), type: "password", placeholder: "sk-ant-..." },
    { key: "searchProvider", label: t("searchProvider"), placeholder: "exa" },
    { key: "searchApiKey", label: t("searchApiKey"), type: "password", placeholder: "api key" },
  ];

  const btnBgBase =
    status === "saved" ? "#059669" : status === "error" ? "var(--color-danger)" : "var(--color-primary)";
  const btnBg =
    status === "saving" ? btnBgBase
    : btnPressed ? "#143058"
    : btnHovered ? "var(--color-primary-dark)"
    : btnBgBase;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {fields.map(({ key, label, type = "text", placeholder }) => (
        <div key={key} style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-primary)",
              marginBottom: 6,
            }}
          >
            {label}
          </label>
          <input
            type={type}
            value={settings[key]}
            onChange={(e) => update(key, e.target.value)}
            placeholder={placeholder}
            style={{
              width: "100%",
              fontSize: 14,
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "8px 12px",
              background: "var(--color-bg)",
              color: "var(--color-text-primary)",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
              transition: "border-color 0.12s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--color-primary)";
              e.target.style.boxShadow = "0 0 0 3px var(--color-primary-light)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--color-border)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
      ))}

      <div style={{ marginTop: 8 }}>
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          onMouseEnter={() => status !== "saving" && setBtnHovered(true)}
          onMouseLeave={() => { setBtnHovered(false); setBtnPressed(false); }}
          onMouseDown={() => status !== "saving" && setBtnPressed(true)}
          onMouseUp={() => setBtnPressed(false)}
          style={{
            padding: "9px 20px",
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 8,
            border: "none",
            background: btnBg,
            color: "#fff",
            cursor: status === "saving" ? "not-allowed" : "pointer",
            opacity: status === "saving" ? 0.7 : 1,
            fontFamily: "inherit",
            transform: btnPressed && status !== "saving" ? "scale(0.97)" : "scale(1)",
            transition: "background 0.12s, transform 0.08s",
            userSelect: "none",
          }}
        >
          {status === "saving" ? "Saving…" : status === "saved" ? t("saved") : status === "error" ? t("saveError") : t("save")}
        </button>
      </div>
    </div>
  );
}
