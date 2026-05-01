/**
 * One-shot enrichment with `enrichPhoneNumber` — runs geocode + carrier +
 * timezones in parallel for each input and prints the combined result.
 */
import { enrichPhoneNumber, parsePhoneNumberFromString } from '../src';

const inputs = ['+14155552671', '+8619912345678', '+442079460958', '+41431234567'];

for (const input of inputs) {
  const phone = parsePhoneNumberFromString(input);
  const enriched = await enrichPhoneNumber(phone, { locale: 'en', carrierLocale: 'en' });
  console.log(input, '→', enriched);
}
