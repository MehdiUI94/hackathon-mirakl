const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const port = process.argv[2] || "3000";

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

const child = spawn(
  binary,
  ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate", "--protocol", "http2"],
  { stdio: "inherit", shell: false }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
