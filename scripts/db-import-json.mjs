#!/usr/bin/env node
import { closeImportPostgresPool, importJsonStateToPostgres } from "../lib/db/import-json.mjs";

function printSection(name, section) {
  console.log(
    `- ${name}: seen=${section.seen}, imported=${section.imported}, updated=${section.updated}, skippedMalformed=${section.skippedMalformed}, skippedDependency=${section.skippedDependency}, failed=${section.failed}`
  );

  if (section.samples.length === 0) {
    return;
  }

  for (const sample of section.samples.slice(0, 5)) {
    const parts = [sample.type];
    if (sample.id) parts.push(`id=${sample.id}`);
    if (sample.index !== undefined) parts.push(`index=${sample.index}`);
    if (sample.reason) parts.push(sample.reason);
    console.log(`  • ${parts.join(" | ")}`);
  }

  if (section.samples.length > 5) {
    console.log(`  • ... ${section.samples.length - 5} more sample(s)`);
  }
}

async function main() {
  const inputPath = process.argv[2] || undefined;
  const report = await importJsonStateToPostgres({ inputPath });

  console.log(`Imported JSON state from: ${report.sourcePath}`);
  console.log(`Duration: ${report.durationMs}ms`);

  if (report.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("Import report:");
  for (const [name, section] of Object.entries(report.sections)) {
    printSection(name, section);
  }

  console.log(
    `Totals: seen=${report.totals.seen}, imported=${report.totals.imported}, updated=${report.totals.updated}, skippedMalformed=${report.totals.skippedMalformed}, skippedDependency=${report.totals.skippedDependency}, failed=${report.totals.failed}`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeImportPostgresPool();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = process.exitCode || 1;
    }
  });
