import path from 'node:path';
import type { ProjectContext } from '../types.js';
import { detectPackageManager, detectReactNativeVersion } from './detect.js';
import { ProjectError, readPackageJson } from './packageJson.js';

export { detectPackageManager, detectReactNativeVersion } from './detect.js';
export { ProjectError, readPackageJson } from './packageJson.js';
export type { ReactNativeVersion } from './detect.js';
export type { PackageJson } from './packageJson.js';

/** Read the project at `cwd` and collect what the checks need. Throws ProjectError if it is not a React Native app. */
export async function buildProjectContext(cwd: string): Promise<ProjectContext> {
  const root = path.resolve(cwd);
  const pkg = await readPackageJson(root);

  const reactNative = detectReactNativeVersion(pkg);
  if (!reactNative) {
    throw new ProjectError(
      `${root} does not look like a React Native app: "react-native" is not in dependencies or devDependencies.`,
    );
  }

  return {
    cwd: root,
    reactNativeVersion: reactNative.version,
    reactNativeRange: reactNative.range,
    packageManager: await detectPackageManager(root, pkg),
    installed: {},
  };
}
