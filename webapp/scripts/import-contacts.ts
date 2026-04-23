#!/usr/bin/env tsx
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "../app/generated/prisma/client";

type ContactRow = {
  brandName: string;
  brandUrl: string;
  email: string;
  contactType: string;
  contactRole: string;
  persona: string;
  subjectHint: string;
  status: string;
  confidence: number | null;
  recommendation: string;
  sourceUrl: string;
  notes: string;
};

const repoRoot = path.resolve(process.cwd(), "..");
const contactsPath = path.join(repoRoot, "contact_marques_enrichi_emails_v2.xlsx");
const workbookPath = path.join(repoRoot, "marketplace_growth_engine_v3.xlsx");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Use a PostgreSQL connection string.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const CONTACT_COLUMNS = [
  "Contact Email",
  "Contact Type",
  "Contact Role",
  "Contact Persona",
  "Contact Subject Hint",
  "Contact Verification Status",
  "Contact Confidence",
  "Contact Send Recommendation",
  "Contact Source URL",
  "Contact Notes",
];

const SHEETS_TO_ENRICH = [
  { name: "Data_Normalisee", headerRow: 3, brandColumn: "Marque", updateCampaignFields: false },
  { name: "Reco_2_best", headerRow: 3, brandColumn: "Marque", updateCampaignFields: false },
  { name: "13_Camp1_Targets", headerRow: 3, brandColumn: "Brand", updateCampaignFields: true },
  { name: "14_Camp1_Emails", headerRow: 3, brandColumn: "Brand", updateCampaignFields: true },
  { name: "15_Camp2_Targets", headerRow: 3, brandColumn: "Brand", updateCampaignFields: true },
  { name: "16_Camp2_Emails", headerRow: 3, brandColumn: "Brand", updateCampaignFields: true },
] as const;

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function num(value: unknown): number | null {
  const raw = clean(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string, headerRow: number) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { aoa: [] as unknown[][], headers: [] as string[], rows: [] as Record<string, unknown>[] };

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  const headers = (aoa[headerRow] ?? []).map((header) => clean(header));
  const rows = aoa.slice(headerRow + 1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );

  return { aoa, headers, rows };
}

function getCell(row: Record<string, unknown>, column: string): string {
  return clean(row[column]);
}

function contactFromRow(row: Record<string, unknown>): ContactRow | null {
  const brandName = getCell(row, "Brand Name");
  const email = getCell(row, "contact_email") || getCell(row, "contact");
  if (!brandName || !email || !email.includes("@")) return null;

  return {
    brandName,
    brandUrl: getCell(row, "brandUrl"),
    email,
    contactType: getCell(row, "contact_type"),
    contactRole: getCell(row, "a_qui_je_m_adresse"),
    persona: getCell(row, "persona_recommande"),
    subjectHint: getCell(row, "objet_conseille"),
    status: getCell(row, "verification_status"),
    confidence: num(row.confidence_score),
    recommendation: getCell(row, "send_recommendation"),
    sourceUrl: getCell(row, "source_url"),
    notes: getCell(row, "notes"),
  };
}

function contactValues(contact: ContactRow) {
  return [
    contact.email,
    contact.contactType,
    contact.contactRole,
    contact.persona,
    contact.subjectHint,
    contact.status,
    contact.confidence ?? "",
    contact.recommendation,
    contact.sourceUrl,
    contact.notes,
  ];
}

function ensureColumns(aoa: unknown[][], headerRow: number, columns: string[]) {
  const headers = (aoa[headerRow] ??= []).map((header) => clean(header));
  const indexes = new Map<string, number>();

  for (const column of columns) {
    const existing = headers.findIndex((header) => header === column);
    if (existing >= 0) {
      indexes.set(column, existing);
      continue;
    }
    headers.push(column);
    indexes.set(column, headers.length - 1);
  }

  aoa[headerRow] = headers;
  return indexes;
}

function setByHeader(
  row: unknown[],
  headers: string[],
  columnName: string,
  value: unknown,
  overwritePlaceholders = true
) {
  const index = headers.findIndex((header) => header === columnName);
  if (index < 0) return false;

  const current = clean(row[index]);
  const isPlaceholder = current === "{{email}}" || current === "{{first_name}}";
  if (!current || (overwritePlaceholders && isPlaceholder)) {
    row[index] = value;
    return true;
  }
  return false;
}

function enrichWorkbook(wb: XLSX.WorkBook, contactsByBrand: Map<string, ContactRow>) {
  const sheetStats: Record<string, { matchedRows: number; emailsWritten: number }> = {};

  for (const sheetConfig of SHEETS_TO_ENRICH) {
    const ws = wb.Sheets[sheetConfig.name];
    if (!ws) continue;

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
    const contactIndexes = ensureColumns(aoa, sheetConfig.headerRow, CONTACT_COLUMNS);
    const headers = (aoa[sheetConfig.headerRow] ?? []).map((header) => clean(header));
    const brandIndex = headers.findIndex((header) => header === sheetConfig.brandColumn);

    let matchedRows = 0;
    let emailsWritten = 0;
    if (brandIndex >= 0) {
      for (let rowIndex = sheetConfig.headerRow + 1; rowIndex < aoa.length; rowIndex++) {
        const row = aoa[rowIndex] ?? [];
        const contact = contactsByBrand.get(normalize(row[brandIndex]));
        if (!contact) continue;

        matchedRows++;
        const values = contactValues(contact);
        CONTACT_COLUMNS.forEach((column, index) => {
          row[contactIndexes.get(column)!] = values[index];
        });

        if (sheetConfig.updateCampaignFields) {
          const wroteEmail = setByHeader(row, headers, "To Email", contact.email);
          const wroteRole = setByHeader(row, headers, "Target Role", contact.contactRole || contact.persona, false);
          if (wroteEmail || wroteRole) emailsWritten++;
        }

        aoa[rowIndex] = row;
      }
    }

    wb.Sheets[sheetConfig.name] = XLSX.utils.aoa_to_sheet(aoa);
    sheetStats[sheetConfig.name] = { matchedRows, emailsWritten };
  }

  const contactsAoA = [
    [
      "Brand Name",
      "Brand URL",
      "Contact Email",
      "Contact Type",
      "Contact Role",
      "Contact Persona",
      "Contact Subject Hint",
      "Verification Status",
      "Confidence",
      "Send Recommendation",
      "Source URL",
      "Notes",
    ],
    ...Array.from(contactsByBrand.values()).map((contact) => [
      contact.brandName,
      contact.brandUrl,
      contact.email,
      contact.contactType,
      contact.contactRole,
      contact.persona,
      contact.subjectHint,
      contact.status,
      contact.confidence ?? "",
      contact.recommendation,
      contact.sourceUrl,
      contact.notes,
    ]),
  ];

  const sheetName = "21_Brand_Contacts";
  wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(contactsAoA);
  if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);

  return sheetStats;
}

async function updateDatabase(contactsByBrand: Map<string, ContactRow>) {
  const brands = await prisma.brand.findMany({ select: { id: true, name: true } });
  let matchedBrands = 0;

  for (const brand of brands) {
    const contact = contactsByBrand.get(normalize(brand.name));
    if (!contact) continue;

    matchedBrands++;
    await prisma.brand.update({
      where: { id: brand.id },
      data: {
        contactEmail: contact.email,
        contactType: contact.contactType || null,
        contactRole: contact.contactRole || null,
        contactPersona: contact.persona || null,
        contactSubjectHint: contact.subjectHint || null,
        contactStatus: contact.status || null,
        contactConfidence: contact.confidence,
        contactRecommendation: contact.recommendation || null,
        contactSourceUrl: contact.sourceUrl || null,
        contactNotes: contact.notes || null,
      },
    });
  }

  return { totalBrands: brands.length, matchedBrands };
}

async function main() {
  if (!fs.existsSync(contactsPath)) throw new Error(`Missing contacts file: ${contactsPath}`);
  if (!fs.existsSync(workbookPath)) throw new Error(`Missing central workbook: ${workbookPath}`);

  const contactWb = XLSX.readFile(contactsPath);
  const contactRows = sheetToRows(contactWb, "Contacts_enrichis", 0).rows;
  const contacts = contactRows.map(contactFromRow).filter((row): row is ContactRow => Boolean(row));
  const contactsByBrand = new Map<string, ContactRow>();
  for (const contact of contacts) {
    const key = normalize(contact.brandName);
    const existing = contactsByBrand.get(key);
    if (!existing || (contact.confidence ?? 0) > (existing.confidence ?? 0)) {
      contactsByBrand.set(key, contact);
    }
  }

  const backupPath = workbookPath.replace(/\.xlsx$/i, `.backup-before-contacts-${new Date().toISOString().slice(0, 10)}.xlsx`);
  if (!fs.existsSync(backupPath)) fs.copyFileSync(workbookPath, backupPath);

  const centralWb = XLSX.readFile(workbookPath, { cellFormula: false, cellStyles: true });
  const sheetStats = enrichWorkbook(centralWb, contactsByBrand);
  XLSX.writeFile(centralWb, workbookPath);

  const dbStats = await updateDatabase(contactsByBrand);

  console.log(JSON.stringify({
    contactsRead: contacts.length,
    uniqueContacts: contactsByBrand.size,
    workbook: path.basename(workbookPath),
    backup: path.basename(backupPath),
    sheetStats,
    database: dbStats,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
