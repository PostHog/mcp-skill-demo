// Stub for the `ai` SDK. The `agents` package has an optional dynamic
// import of `ai` on an elicitation code path we don't use here. We
// alias it to this stub via wrangler.jsonc → "alias" so the bundle
// resolves without pulling in the real package.
export function jsonSchema(): never {
  throw new Error(
    "'ai' SDK not bundled. Install the 'ai' package if you want MCP elicitation support.",
  );
}
