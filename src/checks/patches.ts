import type { Finding, ProjectContext } from '../types.js';

/** Every patch must be re-checked on upgrade; patches for a version that is no longer installed already fail to apply. */
export function checkPatches(ctx: ProjectContext): Finding[] {
  return (ctx.patches ?? []).map((patch): Finding => {
    const installed = ctx.installed[patch.package];
    const stale = installed !== undefined && patch.version !== undefined && installed !== patch.version;
    return {
      id: `patch:${patch.package}`,
      severity: stale ? 'warning' : 'info',
      title: stale
        ? `Patch for ${patch.package}@${patch.version} but ${installed} is installed`
        : `${patch.package} is patched (${patch.file}); re-check the patch when you upgrade it`,
      package: patch.package,
      fix: stale
        ? 'Re-create the patch against the installed version, or delete it if the fix is now upstream.'
        : 'After upgrading, check whether the fix is upstream; if not, re-create the patch for the new version.',
      source: patch.file,
    };
  });
}
