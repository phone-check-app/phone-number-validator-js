/**
 * Vercel Edge route. Drop in `app/api/phone/[[...path]]/route.ts`.
 *
 *   PHONE_RESOURCES_URL=https://cdn.example.com/phone-resources/
 */

import { FetchResourceLoader, setResourceLoader } from '@phonecheck/phone-number-validator-js/serverless';
import { handler } from '@phonecheck/phone-number-validator-js/serverless/vercel';

setResourceLoader(new FetchResourceLoader({ baseUrl: process.env.PHONE_RESOURCES_URL ?? '' }));

export const runtime = 'edge';
export const POST = handler;
export const GET = handler;
export const OPTIONS = handler;
