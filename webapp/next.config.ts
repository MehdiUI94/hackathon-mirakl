import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.24"],
  outputFileTracingIncludes: {
    "/*": [
      "./dev.db",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/@prisma/adapter-better-sqlite3/**/*",
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withNextIntl(nextConfig);
