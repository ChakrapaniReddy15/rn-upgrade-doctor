/** Write examples/09-16kb-apk/good.apk and bad.apk (gitignored). Run: npx tsx scripts/make-example-apks.ts */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleApks } from './example-apks.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', '09-16kb-apk');
const { good, bad } = exampleApks();
await writeFile(path.join(dir, 'good.apk'), good);
await writeFile(path.join(dir, 'bad.apk'), bad);
console.log(`Wrote ${path.relative(process.cwd(), path.join(dir, 'good.apk'))} and bad.apk`);
