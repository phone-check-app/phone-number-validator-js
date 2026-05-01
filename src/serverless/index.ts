/**
 * Serverless entry point — barrel re-exports for every adapter, plus the
 * pure validator. Bundle size is dominated by `libphonenumber-js`; importing
 * a single adapter (`./serverless/aws`, etc.) avoids pulling in the others.
 */

// High-level helpers used by every adapter
export {
  executeValidation,
  type PhoneValidationResult,
  validateBatch,
  validateSingle,
} from './_shared/dispatch';
export {
  classifyRequest,
  MAX_BATCH_SIZE,
  type ValidationDispatch,
  type ValidationFailure,
  type ValidationRequestBody,
} from './_shared/validation';
// Platform adapters — each one is also exported as its own subpath:
//   import awsLambda from '@phonecheck/phone-number-validator-js/serverless/aws'
export { default as awsLambda } from './adapters/aws-lambda';
export { default as azure } from './adapters/azure';
export { default as cloudflare, PhoneValidatorDO } from './adapters/cloudflare';
export { default as gcp } from './adapters/gcp';
export { default as netlify } from './adapters/netlify';
export { default as vercel } from './adapters/vercel';
// Pure validator + loaders + types
export * from './verifier';
