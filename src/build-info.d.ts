// Compile-time build stamps injected by vite `define` (see vite.config.ts).
// Declared with typeof-guards at the use site (lib/build-info.ts) so unit
// tests, which run without the define pass, don't reference an undefined name.
declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD__: string | undefined;
