const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const port = process.argv[2] || "3000";
const mode = process.argv[3] || "quick";

const candidates = [
  path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages",
    "Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "cloudflared.exe"
  ),
  "cloudflared",
];

const binary = candidates.find((candidate) => existsSync(candidate)) || "cloudflared";

if (!binary) {
  console.error("cloudflared introuvable. Installe-le puis relance `npm run tunnel`.");
  process.exit(1);
}

const tunnelName =
  process.env.CLOUDFLARE_TUNNEL_NAME ?? process.env.CF_TUNNEL_NAME ?? "";
const tunnelHostname =
  process.env.CLOUDFLARE_TUNNEL_HOSTNAME ?? process.env.CF_TUNNEL_HOSTNAME ?? "";

const args =
  mode === "named"
    ? ["tunnel", "--no-autoupdate", "run", tunnelName]
    : ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate", "--protocol", "http2"];

if (mode === "named" && !tunnelName) {
  console.error(
    "Tunnel nomme demande mais CLOUDFLARE_TUNNEL_NAME est vide. Renseigne-le dans .env puis relance `npm run tunnel:named`."
  );
  process.exit(1);
}

if (mode === "named") {
  console.log(
    `Demarrage du tunnel Cloudflare nomme "${tunnelName}"${tunnelHostname ? ` pour ${tunnelHostname}` : ""}.`
  );
  console.log(
    "Utilise ensuite cette URL stable dans N8N_CALLBACK_BASE_URL / APP_BASE_URL et dans n8n pour /api/emails/preview."
  );
} else {
  console.log(
    `Demarrage d'un tunnel Cloudflare temporaire vers http://localhost:${port}. L'URL trycloudflare.com changera a chaque relance.`
  );
}

const child = spawn(binary, args, { stdio: "inherit", shell: false });

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
