import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AndroidConfig } from '../types.js';

/**
 * Read SDK levels and flags from a React Native app's android/ folder.
 * Gradle files are code, so this is a best-effort text scan of the common template forms:
 *   minSdkVersion = 24 (Groovy ext), minSdk = 24 / minSdk(24) (Kotlin DSL), minSdkVersion 24 (app/build.gradle).
 * Returns undefined when there is no android/ folder.
 */
export async function readAndroidConfig(cwd: string): Promise<AndroidConfig | undefined> {
  const files = {
    root: await readFirst(cwd, ['android/build.gradle', 'android/build.gradle.kts']),
    app: await readFirst(cwd, ['android/app/build.gradle', 'android/app/build.gradle.kts']),
    properties: await readFirst(cwd, ['android/gradle.properties']),
    wrapper: await readFirst(cwd, ['android/gradle/wrapper/gradle-wrapper.properties']),
  };
  const found = Object.values(files).filter((f): f is SourceFile => f !== undefined);
  if (found.length === 0) return undefined;
  return {
    ...parseAndroidFiles({
      root: files.root?.text,
      app: files.app?.text,
      properties: files.properties?.text,
      wrapper: files.wrapper?.text,
    }),
    files: found.map((f) => f.path),
  };
}

/** Text of the Gradle files that hold SDK levels and flags; any of them may be missing. */
export interface AndroidFiles {
  root?: string;
  app?: string;
  properties?: string;
  wrapper?: string;
}

/** Pure parser shared by the project reader and the React Native template reader. */
export function parseAndroidFiles(files: AndroidFiles): Omit<AndroidConfig, 'files'> {
  // The app module wins when it sets a literal; the template points it at rootProject.ext instead.
  const gradle = [files.app, files.root].filter((t): t is string => t !== undefined).map(stripComments);
  const props = parseProperties(files.properties ?? '');

  return {
    minSdk: firstNumber(gradle, 'minSdk'),
    compileSdk: firstNumber(gradle, 'compileSdk'),
    targetSdk: firstNumber(gradle, 'targetSdk'),
    buildToolsVersion: firstString(gradle, 'buildTools'),
    ndkVersion: firstString(gradle, 'ndkVersion'),
    kotlinVersion: firstString(gradle, 'kotlinVersion'),
    gradleVersion: /gradle-([\d.]+(?:-[\w.]+)?)-(?:all|bin)\.zip/.exec(files.wrapper ?? '')?.[1],
    newArchEnabled: parseBool(props.newArchEnabled),
    hermesEnabled: parseBool(props.hermesEnabled),
  };
}

interface SourceFile {
  path: string;
  text: string;
}

async function readFirst(cwd: string, candidates: string[]): Promise<SourceFile | undefined> {
  for (const candidate of candidates) {
    try {
      return { path: candidate, text: await readFile(path.join(cwd, candidate), 'utf8') };
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1');
}

/** Matches minSdk, minSdkVersion, extra["minSdkVersion"] with "=", "(" or a space before the value. */
function keyPattern(key: string, value: string): RegExp {
  return new RegExp(`(?:\\b${key}(?:Version)?\\b|\\["${key}(?:Version)?"\\])\\s*(?:=\\s*|\\(\\s*|\\s+)${value}`);
}

function firstNumber(texts: string[], key: string): number | undefined {
  for (const text of texts) {
    const match = keyPattern(key, '(\\d+)').exec(text);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function firstString(texts: string[], key: string): string | undefined {
  for (const text of texts) {
    const match = keyPattern(key, `["']([^"']+)["']`).exec(text);
    if (match) return match[1];
  }
  return undefined;
}

export function parseProperties(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const match = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(trimmed);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value.toLowerCase() === 'true';
}
