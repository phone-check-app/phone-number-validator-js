/**
 * Serverless entry point — barrel re-exports for every adapter, plus the
 * pure validator and the helpers that custom-adapter authors need. Bundle
 * size is dominated by `libphonenumber-js`; importing a single adapter
 * (`./serverless/aws`, etc.) avoids pulling in the others.
 */

// CORS + JSON-header helpers — same defaults every adapter uses.
export { corsHeaders, jsonHeaders } from './_shared/cors';
// High-level dispatch helpers — the validator pipeline used by every adapter.
export {
  executeValidation,
  type PhoneValidationResult,
  validateBatch,
  validateSingle,
} from './_shared/dispatch';
// Lambda-shaped helpers (AWS API Gateway, Netlify Functions).
export {
  decodeLambdaBody,
  type LambdaLikeEvent,
  type LambdaResult,
  lambdaResponse,
} from './_shared/lambda-helpers';
// Routing primitives — used by the routed adapters.
export { classifyRoute, healthPayload, type Route } from './_shared/routes';
// Request shape, options, classification — useful when building a custom adapter.
export {
  type BatchOptions,
  type BatchValidation,
  classifyRequest,
  extractBatchOptions,
  MAX_BATCH_SIZE,
  type ValidationDispatch,
  type ValidationFailure,
  type ValidationRequestBody,
  validateBatchField,
} from './_shared/validation';
// Web-API helpers (Vercel Edge / Cloudflare / Deno Deploy / browsers).
export {
  jsonResponse as webJsonResponse,
  parseQueryParams,
  readJsonBody,
  requireJsonContentType,
} from './_shared/web-helpers';

// Platform adapters — each one is also exported as its own subpath:
//   import awsLambda from '@phonecheck/phone-number-validator-js/serverless/aws'
export { default as awsLambda } from './adapters/aws-lambda';
export { default as azure } from './adapters/azure';
export { default as cloudflare, PhoneValidatorDO } from './adapters/cloudflare';
export { default as gcp } from './adapters/gcp';
export { default as netlify } from './adapters/netlify';
export { default as vercel } from './adapters/vercel';

// Pure validator + loaders + types (re-exports libphonenumber-js, cache,
// resolver, EnrichmentResult / EnrichOptions, ResourceLoader, etc.)
export * from './verifier';
