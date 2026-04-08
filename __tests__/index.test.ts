import { carrier, geocoder, parsePhoneNumberFromString, timezones } from '../src'

it('geocodes with default locale en', () => {
  const phoneNr = parsePhoneNumberFromString('+41431234567')
  const location = geocoder(phoneNr)
  expect(location).toEqual('Zurich')
})

it('geocodes other locales correctly', () => {
  const phoneNr = parsePhoneNumberFromString('+41431234567')
  const locationDE = geocoder(phoneNr, 'de')
  expect(locationDE).toEqual('Zürich')
  const locationIT = geocoder(phoneNr, 'it')
  expect(locationIT).toEqual('Zurigo')
})

it('maps a carrier correctly', () => {
  const phoneNr = parsePhoneNumberFromString('01701234567', 'DE')
  const carrierEN = carrier(phoneNr)
  expect(carrierEN).toEqual('T-Mobile')
  // Test fallback to English when locale not available
  // Temporarily suppress console.error for this test
  const originalError = console.error
  console.error = jest.fn()
  const carrierAR = carrier(phoneNr, 'ar')
  console.error = originalError
  expect(carrierAR).toEqual('T-Mobile')
})

it('maps carriers with different locales correctly', () => {
  const phoneNr = parsePhoneNumberFromString('+8619912345678')
  const carrierEN = carrier(phoneNr)
  expect(carrierEN).toEqual('China Telecom')
  const carrierZH = carrier(phoneNr, 'zh')
  expect(carrierZH).toEqual('中国电信')
})

it('maps timezones correctly', () => {
  const phoneNr1 = parsePhoneNumberFromString('+49301234567')
  const tz1 = timezones(phoneNr1)
  expect(tz1).toEqual(['Europe/Berlin'])

  const phoneNr2 = parsePhoneNumberFromString('646-273-5246', 'US')
  const tz2 = timezones(phoneNr2)
  expect(tz2).toContain('America/New_York')
})

it('maps issue #7 to the correct carrier', () => {
  const phoneNr = parsePhoneNumberFromString('+420779990001')
  const carrierCZ = carrier(phoneNr)
  expect(carrierCZ).toContain('T-Mobile')
})

it('maps issue #8 to the correct timezone', () => {
  const phoneNr = parsePhoneNumberFromString('+19168085888')
  const tzs = timezones(phoneNr)
  expect(tzs).toEqual(['America/Los_Angeles'])
})

it('returns null without error for country codes without geocode data (e.g. France +33)', () => {
  const phoneNr = parsePhoneNumberFromString('+33140205050')
  const spy = jest.spyOn(console, 'error')
  const location = geocoder(phoneNr)
  expect(location).toBeNull()
  expect(spy).not.toHaveBeenCalled()
  spy.mockRestore()
})
