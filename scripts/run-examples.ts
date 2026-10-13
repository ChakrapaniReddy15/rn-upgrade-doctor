/**
 * Run every example through the CLI (offline, against examples/registry-snapshot) and print the terminal report.
 * Exits 1 if any example's exit code differs from the one listed in scripts/examples.ts.
 * Run from the repository root: npm run examples
 */
import { spawnSync } from 'node:child_process';
import { EXAMPLES, exampleArgs } from './examples.js';

let mismatches = 0;
for (const example of EXAMPLES) {
  const args = [...exampleArgs(example), '--format', 'terminal'];
  console.log(`\n━━━ ${example.name}  ·  npx tsx src/cli.ts ${args.join(' ')}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { stdio: 'inherit' });
  const ok = result.status === example.exitCode;
  if (!ok) mismatches++;
  console.log(`exit code ${result.status} (expected ${example.exitCode}) ${ok ? '✓' : '✗ MISMATCH'}`);
}

console.log(`\n${EXAMPLES.length - mismatches}/${EXAMPLES.length} examples exited as expected.`);
process.exitCode = mismatches > 0 ? 1 : 0;
