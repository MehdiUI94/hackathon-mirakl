import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/app/generated/prisma/client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const resolvedPath = resolveDatabasePath();

const adapter = new PrismaBetterSqlite3({
  url: `file:${resolvedPath}`,
});

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function resolveDatabasePath() {
  const configured = process.env.DATABASE_URL?.replace("file:", "");
  if (configured) {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
  }

  if (!isNetlifyRuntime()) {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), "./dev.db");
  }

  const tmpDbPath = path.join(os.tmpdir(), "hackathon-mirakl-dev.db");
  if (fs.existsSync(tmpDbPath)) {
    return tmpDbPath;
  }

  const bundledDbPath = findBundledDatabasePath();
  if (bundledDbPath) {
    fs.copyFileSync(bundledDbPath, tmpDbPath);
    return tmpDbPath;
  }

  return tmpDbPath;
}

function isNetlifyRuntime() {
  return process.env.NETLIFY === "true" || process.env.AWS_LAMBDA_FUNCTION_NAME;
}

function findBundledDatabasePath() {
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "dev.db"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), ".next", "server", "dev.db"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "webapp", "dev.db"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
