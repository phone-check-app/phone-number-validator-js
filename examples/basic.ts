/**
 * Basic usage — parse, geocode, carrier, timezones for a handful of
 * international numbers. Run with `bun run examples/basic.ts`.
 */
import { carrier, geocoder, parsePhoneNumberFromString, timezones } from '../src';

const samples: Array<[string, string?]> = [
  ['+41431234567'], // Zurich landline
  ['01701234567', 'DE'], // T-Mobile DE mobile (national format)
  ['+8619912345678'], // China Telecom mobile
  ['+12124567890'], // New York landline
  ['+33140205050'], // FR — no geocoding data shipped
  ['not a number'], // unparseable
];

for (const [input, country] of samples) {
  const phone = parsePhoneNumberFromString(input, country as undefined);
  console.log(`Input: ${input}${country ? ` (${country})` : ''}`);
  if (!phone?.isValid()) {
    console.log('  → invalid\n');
    continue;
  }
  console.log(`  E.164:    ${phone.format('E.164')}`);
  console.log(`  type:     ${phone.getType()}`);
  console.log(`  geocode:  ${geocoder(phone) ?? '—'}`);
  console.log(`  carrier:  ${carrier(phone) ?? '—'}`);
  console.log(`  timezones: ${timezones(phone)?.join(', ') ?? '—'}`);
  console.log();
}
