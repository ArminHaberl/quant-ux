import { shortSessionId } from '../../src/utils/session'

describe('shortSessionId', () => {

  it('passes through short ids', () => {
    expect(shortSessionId('ABC')).toBe('ABC')
  })

  it('truncates long ids with an ellipsis', () => {
    const id = 'IO2E1QXWWO1GZKSV07BHY9P1TIO8FOXY'
    expect(shortSessionId(id)).toBe('IO2E1QXW…')
  })

  it('returns the full id at exactly the keep length', () => {
    const id = 'IO2E1QXW'
    expect(shortSessionId(id)).toBe('IO2E1QXW')
  })

  it('honors a custom keep length', () => {
    const id = 'IO2E1QXWWO1GZKSV07BHY9P1TIO8FOXY'
    expect(shortSessionId(id, 4)).toBe('IO2E…')
  })

  it('is empty safe', () => {
    expect(shortSessionId(null)).toBe('')
    expect(shortSessionId(undefined)).toBe('')
    expect(shortSessionId('')).toBe('')
  })
})
