import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IosConfig } from '../types.js';

/** Read the iOS deployment target and flags from ios/Podfile and ios/Podfile.lock. Undefined when there is no Podfile. */
export async function readIosConfig(cwd: string): Promise<IosConfig | undefined> {
  const podfile = await readText(path.join(cwd, 'ios/Podfile'));
  if (podfile === undefined) return undefined;
  const lock = await readText(path.join(cwd, 'ios/Podfile.lock'));
  return { ...parsePodfile(podfile), ...parsePodfileLock(lock ?? ''), files: lock === undefined ? ['ios/Podfile'] : ['ios/Podfile', 'ios/Podfile.lock'] };
}

export function parsePodfile(text: string): Omit<IosConfig, 'files' | 'podsReactNativeVersion' | 'cocoapodsVersion'> {
  const code = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
  const platform = /^\s*platform\s+:ios\s*,\s*(.+)$/m.exec(code)?.[1]?.trim();
  const literal = platform ? /^["']([\d.]+)["']/.exec(platform)?.[1] : undefined;

  // ENV['RCT_NEW_ARCH_ENABLED'] = '1'  (pre-0.76 apps turn it on this way; 0.76+ apps turn it off with '0')
  const newArch = /ENV\[\s*["']RCT_NEW_ARCH_ENABLED["']\s*\]\s*=\s*["']?([01])["']?/.exec(code)?.[1];
  // :hermes_enabled => false   or   hermes_enabled: false
  const hermes = /:?hermes_enabled\s*(?:=>|:)\s*(true|false)/.exec(code)?.[1];

  return {
    minIos: literal,
    usesRnMinIos: platform?.includes('min_ios_version_supported') ?? false,
    newArchEnabled: newArch === undefined ? undefined : newArch === '1',
    hermesEnabled: hermes === undefined ? undefined : hermes === 'true',
  };
}

export function parsePodfileLock(text: string): Pick<IosConfig, 'podsReactNativeVersion' | 'cocoapodsVersion'> {
  return {
    // Top-level pod entries are indented by exactly two spaces; deeper lines are dependencies like "React-Core (= 0.84.1)".
    podsReactNativeVersion: /^ {2}- React-Core \(([^)=\s][^)]*)\)/m.exec(text)?.[1],
    cocoapodsVersion: /^COCOAPODS: (\S+)/m.exec(text)?.[1],
  };
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}
