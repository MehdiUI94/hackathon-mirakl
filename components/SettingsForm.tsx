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

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
      {fields.map(({ key, label, type = "text", placeholder }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">{label}</label>
          <input
            type={type}
            value={settings[key]}
            onChange={(e) => update(key, e.target.value)}
            placeholder={placeholder}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2.5 bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
          />
        </div>
      ))}

      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            status === "saved"
              ? "bg-emerald-600 text-white"
              : status === "error"
              ? "bg-red-600 text-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          }`}
        >
          {status === "saving"
            ? "Saving…"
            : status === "saved"
            ? t("saved")
            : status === "error"
            ? t("saveError")
            : t("save")}
        </button>
      </div>
    </div>
  );
}
