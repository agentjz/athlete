import Database from "better-sqlite3";

import { prepareControlPlaneLayout } from "./layout.js";
import { applyLedgerMigrations } from "./migrations.js";
import type { ProjectStatePaths } from "../../project/statePaths.js";

export interface ProjectLedgerContext {
  db: Database.Database;
  paths: ProjectStatePaths;
}

export async function withProjectLedger<T>(
  rootDir: string,
  callback: (context: ProjectLedgerContext) => T,
): Promise<T> {
  const paths = await prepareControlPlaneLayout(rootDir);
  const db = new Database(paths.controlPlaneDbFile);
  try {
    configureProjectLedger(db);
    applyLedgerMigrations(db);
    return callback({ db, paths });
  } finally {
    db.close();
  }
}

function configureProjectLedger(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
}
