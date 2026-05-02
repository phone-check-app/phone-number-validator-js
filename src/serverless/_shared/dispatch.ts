/**
 * Turn a classified request into the actual lookup. Single inputs return one
 * result; batches return an array (one entry per input, in order — bad inputs
 * yield a result with `valid: false` rather than aborting the whole batch).
 *
 * Enrichment (geocode / carrier / timezones) runs by default. Callers can
 * skip individual lookups via `BatchOptions` — useful when only format
 * validation is needed (faster + works without the BSON resource tree).
 */
import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { carrierAsync, geocoderAsync, timezonesAsync } from '../../core';
import type { CarrierLocale, GeocoderLocale } from '../../types';
import type { BatchOptions, ValidationDispatch } from './validation';

export interface PhoneValidationResult {
  input: string;
  valid: boolean;
  error?: string;
  formatted?: {
    e164: string;
    international: string;
    national: string;
    rfc3966: string;
  };
  country?: string;
  countryCallingCode?: string;
  nationalNumber?: string;
  type?: string;
  // Enrichment fields. `undefined` means "lookup was skipped"; `null` means
  // "lookup ran but found nothing". Callers can disambiguate via
  // `'geocode' in result` if they need to.
  geocode?: string | null;
  carrier?: string | null;
  timezones?: string[] | null;
}

interface ValidateOneOptions {
  defaultCountry?: string;
  locale: GeocoderLocale;
  carrierLocale: CarrierLocale;
  geocode: boolean;
  carrier: boolean;
  timezones: boolean;
}

function resolveOptions(options: BatchOptions): ValidateOneOptions {
  return {
    defaultCountry: options.defaultCountry,
    locale: options.locale ?? 'en',
    carrierLocale: options.carrierLocale ?? 'en',
    // Each enrichment toggle defaults to ON when unset — opt-out, not opt-in.
    geocode: options.geocode ?? true,
    carrier: options.carrier ?? true,
    timezones: options.timezones ?? true,
  };
}

async function validateOne(input: string, options: ValidateOneOptions): Promise<PhoneValidationResult> {
  const parsed = parsePhoneNumberFromString(input, options.defaultCountry as CountryCode | undefined);
  if (!parsed?.isValid()) {
    return { input, valid: false, error: 'Invalid or unparseable phone number' };
  }

  // Run only the enrichments the caller asked for. Skipped lookups are
  // omitted from the result rather than emitting `null` (lets callers tell
  // "didn't run" from "ran but no data").
  const [geocode, carrier, timezones] = await Promise.all([
    options.geocode ? geocoderAsync(parsed, options.locale) : Promise.resolve(undefined),
    options.carrier ? carrierAsync(parsed, options.carrierLocale) : Promise.resolve(undefined),
    options.timezones ? timezonesAsync(parsed) : Promise.resolve(undefined),
  ]);

  const result: PhoneValidationResult = {
    input,
    valid: true,
    formatted: {
      e164: parsed.format('E.164'),
      international: parsed.formatInternational(),
      national: parsed.formatNational(),
      rfc3966: parsed.format('RFC3966'),
    },
    country: parsed.country,
    countryCallingCode: parsed.countryCallingCode.toString(),
    nationalNumber: parsed.nationalNumber.toString(),
    type: parsed.getType(),
  };
  if (geocode !== undefined) result.geocode = geocode;
  if (carrier !== undefined) result.carrier = carrier;
  if (timezones !== undefined) result.timezones = timezones;
  return result;
}

export async function executeValidation(
  dispatch: ValidationDispatch
): Promise<PhoneValidationResult | PhoneValidationResult[]> {
  const opts = resolveOptions(dispatch.options);

  if (dispatch.kind === 'single') {
    return validateOne(dispatch.phoneNumber, opts);
  }

  return Promise.all(dispatch.phoneNumbers.map((p) => validateOne(p, opts)));
}

export async function validateSingle(input: string, options: BatchOptions = {}): Promise<PhoneValidationResult> {
  return validateOne(input, resolveOptions(options));
}

export async function validateBatch(inputs: string[], options: BatchOptions = {}): Promise<PhoneValidationResult[]> {
  const opts = resolveOptions(options);
  return Promise.all(inputs.map((p) => validateOne(p, opts)));
}
