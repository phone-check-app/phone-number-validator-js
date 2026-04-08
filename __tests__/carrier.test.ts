import parsePhoneNumber from 'libphonenumber-js'
import { carrier } from '../src'

describe('Phone Number Lookup', () => {
  it('should return carrier', () => {
    const phoneNumber = parsePhoneNumber('+14158586273')
    const res = carrier(phoneNumber)
    expect(res).toEqual(null)
  })
})
