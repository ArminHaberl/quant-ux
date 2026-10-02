/**
 * @jest-environment jsdom
 */
import ImageService from '../../src/services/ImageService'

/**
 * Stand in for XMLHttpRequest. The real one answers on its own schedule, so the
 * tests drive the handlers by hand and can leave them untriggered on purpose.
 */
class FakeXHR {
  constructor () {
    this.status = 0
    this.response = ''
    this.requestHeaders = {}
    this.timeout = 0
    this.opened = null
    FakeXHR.sent.push(this)
  }

  open (method, url) {
    this.opened = {method: method, url: url}
  }

  setRequestHeader (name, value) {
    this.requestHeaders[name] = value
  }

  send (body) {
    this.body = body
  }
}
FakeXHR.sent = []

/**
 * Reports what a promise did, or 'pending' if it never settles. A regression
 * that leaves an import waiting forever should fail immediately and say so,
 * rather than run into the jest timeout with no explanation.
 */
function outcome (promise, ms = 200) {
  return Promise.race([
    promise.then(() => 'resolved', err => 'rejected: ' + err.message),
    new Promise(resolve => setTimeout(() => resolve('pending'), ms))
  ])
}

describe('ImageService.upload', () => {

  let originalXHR
  let consoleError

  beforeEach(() => {
    originalXHR = global.XMLHttpRequest
    global.XMLHttpRequest = FakeXHR
    FakeXHR.sent = []
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    ImageService.setToken('a-token')
  })

  afterEach(() => {
    global.XMLHttpRequest = originalXHR
    consoleError.mockRestore()
  })

  test('resolves with the response body on 200', async () => {
    let promise = ImageService.upload('/rest/images/m1', new FormData())
    let xhr = FakeXHR.sent[0]
    xhr.status = 200
    xhr.response = '{"uploads":[{"url":"a.png"}]}'
    xhr.onload()

    await expect(promise).resolves.toBe('{"uploads":[{"url":"a.png"}]}')
  })

  /**
   * The original defect: the handler was a plain function, so `this` was the
   * XHR and `this.logger` threw before reject() was reached. Every failed
   * upload left the caller awaiting forever.
   */
  test('rejects on a non 200 response instead of hanging', async () => {
    let promise = ImageService.upload('/rest/images/m1', new FormData())
    let xhr = FakeXHR.sent[0]
    xhr.status = 401
    xhr.response = 'Unauthorized'
    xhr.onload()

    expect(await outcome(promise)).toMatch(/^rejected: .*401/)
  })

  test('reports the server message in the rejection', async () => {
    let promise = ImageService.upload('/rest/images/m1', new FormData())
    let xhr = FakeXHR.sent[0]
    xhr.status = 413
    xhr.response = 'image too large'
    xhr.onload()

    expect(await outcome(promise)).toContain('image too large')
  })

  test('rejects on a network error', async () => {
    let promise = ImageService.upload('/rest/images/m1', new FormData())
    FakeXHR.sent[0].onerror()

    expect(await outcome(promise)).toMatch(/^rejected: .*network error/)
  })

  test('rejects on a timeout', async () => {
    let promise = ImageService.upload('/rest/images/m1', new FormData())
    FakeXHR.sent[0].ontimeout()

    expect(await outcome(promise)).toMatch(/^rejected: .*timeout/)
  })

  test('rejects on an abort', async () => {
    let promise = ImageService.upload('/rest/images/m1', new FormData())
    FakeXHR.sent[0].onabort()

    expect(await outcome(promise)).toMatch(/^rejected: .*aborted/)
  })

  test('never leaves the request without a timeout of its own', async () => {
    ImageService.upload('/rest/images/m1', new FormData())

    expect(FakeXHR.sent[0].timeout).toBeGreaterThan(0)
  })

  test('sends the bearer token', async () => {
    ImageService.upload('/rest/images/m1', new FormData())

    expect(FakeXHR.sent[0].requestHeaders['Authorization']).toBe('Bearer a-token')
  })
})
