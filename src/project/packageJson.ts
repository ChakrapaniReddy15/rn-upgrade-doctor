import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The subset of package.json fields the scanner uses. */
export interface PackageJson {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** A problem with the scanned project itself (missing or invalid files). The CLI maps it to exit code 2. */
export class ProjectError extends Error {
  override name = 'ProjectError';
}

export async function readPackageJson(cwd: string): Promise<PackageJson> {
  const file = path.join(cwd, 'package.json');
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProjectError(`No package.json found in ${cwd}. Run the scan from your React Native project folder or pass --cwd.`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ProjectError(`Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProjectError(`${file} is not a JSON object.`);
  }
  return parsed as PackageJson;
}
