// Single source of truth for the version string shown in the UI footers.
// Injected from package.json at build time (see vite.config.ts) so it can't
// drift from the package version (#173).
declare const __APP_VERSION__: string;

export const APP_VERSION = `v${__APP_VERSION__}`;
