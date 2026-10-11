import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { HomeType } from "./schema";
import type { NewSignup, UpsertResult, WaitlistStore } from "./store";

type Row = NewSignup & {
  homeType: HomeType | null;
  postcode: string | null;
  createdAt: string;
  updatedAt: string;
  detailsAt: string | null;
};

/**
 * Local store: keeps sign-ups in `.data/waitlist.json` (or WAITLIST_FILE) so the flow works
 * without a database, in development and in e2e runs. Never used on a real deployment (see getStore).
 */
export class FileStore implements WaitlistStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file = process.env.WAITLIST_FILE || path.join(process.cwd(), ".data", "waitlist.json")) {}

  upsertSignup(signup: NewSignup): Promise<UpsertResult> {
    return this.exclusive(async () => {
      const rows = await this.read();
      const now = new Date().toISOString();
      const existing = rows.find((r) => r.email === signup.email);
      if (existing) {
        const canAddDetails = existing.homeType === null;
        if (canAddDetails) existing.editTokenHash = signup.editTokenHash;
        existing.updatedAt = now;
        await this.write(rows);
        return { referralCode: existing.referralCode, created: false, canAddDetails };
      }
      rows.push({ ...signup, homeType: null, postcode: null, createdAt: now, updatedAt: now, detailsAt: null });
      await this.write(rows);
      return { referralCode: signup.referralCode, created: true, canAddDetails: true };
    });
  }

  saveDetails(editTokenHash: string, details: { homeType: HomeType; postcode: string }): Promise<boolean> {
    return this.exclusive(async () => {
      const rows = await this.read();
      const row = rows.find((r) => r.editTokenHash === editTokenHash);
      if (!row) return false;
      const now = new Date().toISOString();
      Object.assign(row, { ...details, detailsAt: now, updatedAt: now });
      await this.write(rows);
      return true;
    });
  }

  /** Serialises read-modify-write cycles within this process. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<Row[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Row[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async write(rows: Row[]) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(rows, null, 2));
    await rename(tmp, this.file);
  }
}
