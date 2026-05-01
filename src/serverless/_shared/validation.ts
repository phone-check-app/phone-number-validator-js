/**
 * Request body classification shared by every serverless adapter.
 *
 * Every adapter accepts the same JSON shape:
 *   { phoneNumber: "+14155552671", defaultCountry?: "US", locale?: "en", carrierLocale?: "en" }
 *
 * Or a batch:
 *   { phoneNumbers: ["+14155552671", "+442079460958"], defaultCountry?: "US", ... }
 *
 * Centralising the shape (and the 100-entry batch cap) means a future change
 * lands in one place instead of six adapter files.
 */
import type { CarrierLocale, GeocoderLocale } from '../../types';

export const MAX_BATCH_SIZE = 100;

/** Fields shared by request bodies and downstream `BatchOptions`. */
interface ValidationCommon {
  defaultCountry?: string;
  locale?: GeocoderLocale;
  carrierLocale?: CarrierLocale;
  /** Run the geocoder lookup (default: true). */
  geocode?: boolean;
  /** Run the carrier lookup (default: true). */
  carrier?: boolean;
  /** Run the timezone lookup (default: true). */
  timezones?: boolean;
}

export interface ValidationRequestBody extends ValidationCommon {
  phoneNumber?: string;
  phoneNumbers?: string[];
}

export type BatchOptions = ValidationCommon;

export type ValidationDispatch =
  | { kind: 'single'; phoneNumber: string; options: BatchOptions }
  | { kind: 'batch'; phoneNumbers: string[]; options: BatchOptions };

export interface ValidationFailure {
  kind: 'invalid';
  status: 400;
  message: string;
}

export type BatchValidation = { ok: true; phoneNumbers: string[] } | { ok: false; status: 400; message: string };

/** Lift the locale + enrichment fields out of a request body. */
export function extractBatchOptions(body: ValidationRequestBody): BatchOptions {
  return {
    defaultCountry: body.defaultCountry,
    locale: body.locale,
    carrierLocale: body.carrierLocale,
    geocode: body.geocode,
    carrier: body.carrier,
    timezones: body.timezones,
  };
}

export function validateBatchField(phoneNumbers: unknown): BatchValidation {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return { ok: false, status: 400, message: 'phoneNumbers array is required' };
  }
  if (phoneNumbers.length > MAX_BATCH_SIZE) {
    return { ok: false, status: 400, message: `Maximum ${MAX_BATCH_SIZE} phone numbers per batch` };
  }
  return { ok: true, phoneNumbers: phoneNumbers as string[] };
}

const MISSING_INPUT: ValidationFailure = {
  kind: 'invalid',
  status: 400,
  message: 'phoneNumber or phoneNumbers array is required',
};

export function classifyRequest(
  body: ValidationRequestBody | null | undefined
): ValidationDispatch | ValidationFailure {
  if (!body) return MISSING_INPUT;

  const options = extractBatchOptions(body);

  // Batch wins if both fields are present — phoneNumbers is the more specific
  // intent. Empty arrays are flagged by `validateBatchField`.
  if (body.phoneNumbers !== undefined) {
    const validated = validateBatchField(body.phoneNumbers);
    if (!validated.ok) return { kind: 'invalid', status: validated.status, message: validated.message };
    return { kind: 'batch', phoneNumbers: validated.phoneNumbers, options };
  }

  if (body.phoneNumber) {
    return { kind: 'single', phoneNumber: body.phoneNumber, options };
  }

  return MISSING_INPUT;
}
