import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/app/generated/prisma/client";
import path from "node:path";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "./dev.db";
const resolvedPath = path.resolve(process.cwd(), dbPath);

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
