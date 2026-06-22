export interface BuildInfo {
  name: string;
  version: string;
  commit: string;
  branch: string;
  dirty: boolean;
  builtAt: string;
  sourceFingerprint: string;
}

declare const __MM_BUILD_INFO__: BuildInfo;

declare global {
  interface Window {
    __MAGNET_MARBLES_BUILD__?: BuildInfo;
  }
}

export const BUILD_INFO: BuildInfo = __MM_BUILD_INFO__;

export function installBuildInfo() {
  window.__MAGNET_MARBLES_BUILD__ = BUILD_INFO;
  document.documentElement.dataset.buildCommit = BUILD_INFO.commit;
  document.documentElement.dataset.buildBranch = BUILD_INFO.branch;
  document.documentElement.dataset.buildDirty = String(BUILD_INFO.dirty);
  document.documentElement.dataset.buildTime = BUILD_INFO.builtAt;
  document.documentElement.dataset.sourceFingerprint = BUILD_INFO.sourceFingerprint;
}
