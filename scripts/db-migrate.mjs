#!/usr/bin/env node
import { runMigrations } from "../lib/db/migrations.js";

async function main() {
  const result = await runMigrations();

  if (result.appliedNow.length === 0) {
    console.log("No pending migrations.");
  } else {
    console.log(`Applied ${result.appliedNow.length} migration(s):`);
    for (const name of result.appliedNow) {
      console.log(`- ${name}`);
    }
  }

  console.log(`Total applied: ${result.appliedTotal.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
