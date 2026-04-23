#!/usr/bin/env tsx
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import path from "node:path";
import { PrismaClient } from "../app/generated/prisma/client";

const workbookPath = path.resolve(process.cwd(), "..", "marketplace_growth_engine_v3.xlsx");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Use a PostgreSQL connection string.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function readRows(wb: XLSX.WorkBook, sheetName: string, headerRow: number) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  const headers = (raw[headerRow] ?? []).map((header) => String(header ?? "").trim());
  return raw.slice(headerRow + 1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

async function main() {
  const wb = XLSX.readFile(workbookPath);
  const rows = [...readRows(wb, "FR30_Universe", 3), ...readRows(wb, "FR30_Top2", 3)];
  const signalsByBrand = new Map<string, { amazonSignal: string; zalandoSignal: string }>();

  for (const row of rows) {
    const brand = String(row.Brand ?? "").trim();
    if (!brand) continue;
    const amazonSignal = String(row["Amazon FR signal"] ?? row["Amazon Signal"] ?? "").trim();
    const zalandoSignal = String(row["Zalando signal"] ?? row["Zalando Status"] ?? "").trim();
    if (!amazonSignal && !zalandoSignal) continue;
    signalsByBrand.set(normalize(brand), { amazonSignal, zalandoSignal });
  }

  const brands = await prisma.brand.findMany({ select: { id: true, name: true } });
  let matched = 0;
  let amazonNotZalando = 0;

  for (const brand of brands) {
    const signals = signalsByBrand.get(normalize(brand.name));
    if (!signals) continue;
    matched++;
    if (isAmazonNotZalando(signals.amazonSignal, signals.zalandoSignal)) amazonNotZalando++;
    await prisma.brand.update({
      where: { id: brand.id },
      data: {
        amazonSignal: signals.amazonSignal || null,
        zalandoSignal: signals.zalandoSignal || null,
      },
    });
  }

  console.log(JSON.stringify({ signalsRead: signalsByBrand.size, matched, amazonNotZalando }, null, 2));
}

function isAmazonNotZalando(amazonSignal: string, zalandoSignal: string) {
  const amazon = amazonSignal.toLowerCase();
  const zalando = zalandoSignal.toLowerCase();
  return /oui|observed|signal|storefront|search/.test(amazon) && /\bnon\b|absent|pas de/.test(zalando);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
