/**
 * Minimal AWS Lambda handler — wires a `FetchResourceLoader` for the BSON
 * tables (host them on a public R2 / S3 / CloudFront in front of S3).
 *
 *   PHONE_RESOURCES_URL=https://cdn.example.com/phone-resources/
 */

import { FetchResourceLoader, setResourceLoader } from '@phonecheck/phone-number-validator-js/serverless';
import lambda from '@phonecheck/phone-number-validator-js/serverless/aws';

setResourceLoader(new FetchResourceLoader({ baseUrl: process.env.PHONE_RESOURCES_URL ?? '' }));

// Routed: GET /health, POST /validate, POST /validate/batch
export const handler = lambda.handler;
