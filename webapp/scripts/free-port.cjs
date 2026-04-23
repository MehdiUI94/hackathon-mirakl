const { execFileSync } = require("node:child_process");

const port = process.argv[2] || "3000";

if (process.platform !== "win32") {
  process.exit(0);
}

try {
  const script = [
    `$port = ${JSON.stringify(String(port))}`,
    "$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1",
    "if ($conn) {",
    "  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue",
    "}",
  ].join("; ");

  execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    stdio: "ignore",
  });
} catch {
  // If the port is already free or PowerShell cannot resolve the process, we
  // still want `npm run dev` to continue.
}
