// Pull version from the root package.json so AboutModal always shows the latest app version.
// Also allow optional env overrides when building (handy for CI).

// NOTE: ensure tsconfig has: "resolveJsonModule": true
import pkg from '../../package.json';

const env = (import.meta as any).env || {};

export const APP_VERSION: string =
    env.VITE_APP_VERSION || pkg.version || '0.0.0';

export const BUILD_DATE: string =
    env.VITE_BUILD_DATE || new Date().toISOString();

export const COMMIT_HASH: string =
    env.VITE_COMMIT_HASH || '';
