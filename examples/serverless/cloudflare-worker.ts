/**
 * Minimal Cloudflare Worker — re-export the Cloudflare adapter and bind
 * `PHONE_RESOURCES` (KV) in `wrangler.toml`. The adapter auto-installs a
 * `KvResourceLoader` from the binding.
 *
 *   [[kv_namespaces]]
 *   binding = "PHONE_RESOURCES"
 *   id      = "<your-namespace-id>"
 */
export { default, PhoneValidatorDO } from '@phonecheck/phone-number-validator-js/serverless/cloudflare';
