import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FallbackDraft = {
  id: string;
  brandId: string | null;
  marketplaceId: string | null;
  brandName: string;
  marketplaceName: string;
  campaign: string | null;
  step: number;
  branch: string | null;
  toEmail: string;
  toFirstName: string | null;
  subject: string;
  bodyText: string;
  cta: string | null;
  stopRule: string | null;
  claimSources: string;
  meta: string;
  callbackUrl: string | null;
  n8nExecutionId: string | null;
  status: string;
  edited: boolean;
  receivedAt: string;
  decidedAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
};

type DraftStoreFile = {
  drafts: FallbackDraft[];
};

const STORE_PATH = path.join(os.tmpdir(), "hackathon-mirakl-drafts.json");

export function useNetlifyDraftStore() {
  return process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export function listFallbackDrafts(filters?: {
  status?: string;
  campaign?: string;
  q?: string;
}) {
  const drafts = readStore().drafts.filter((draft) => {
    if (filters?.status && draft.status !== filters.status) return false;
    if (filters?.campaign && draft.campaign !== filters.campaign) return false;
    if (filters?.q) {
      const q = filters.q.toLowerCase();
      const matches =
        draft.brandName.toLowerCase().includes(q) ||
        draft.toEmail.toLowerCase().includes(q) ||
        draft.subject.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  return drafts.sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
  });
}

export function countFallbackDrafts() {
  const counts: Record<string, number> = {};
  for (const draft of readStore().drafts) {
    counts[draft.status] = (counts[draft.status] ?? 0) + 1;
  }
  return counts;
}

export function getFallbackDraft(id: string) {
  return readStore().drafts.find((draft) => draft.id === id) ?? null;
}

export function createFallbackDraft(
  draft: Omit<FallbackDraft, "id" | "receivedAt" | "decidedAt" | "sentAt" | "errorMessage">
) {
  const store = readStore();
  const record: FallbackDraft = {
    ...draft,
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    decidedAt: null,
    sentAt: null,
    errorMessage: null,
  };
  store.drafts.unshift(record);
  writeStore(store);
  return record;
}

export function updateFallbackDraft(
  id: string,
  patch: Partial<FallbackDraft>
) {
  const store = readStore();
  const index = store.drafts.findIndex((draft) => draft.id === id);
  if (index === -1) return null;
  store.drafts[index] = { ...store.drafts[index], ...patch };
  writeStore(store);
  return store.drafts[index];
}

function readStore(): DraftStoreFile {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { drafts: [] };
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as DraftStoreFile;
    return { drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [] };
  } catch {
    return { drafts: [] };
  }
}

function writeStore(store: DraftStoreFile) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}
