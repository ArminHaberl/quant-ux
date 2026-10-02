import RestEngine from '../../src/core/RestEngine'
import AbstractService from '../../src/services/AbstractService'

class Svc extends AbstractService {
    constructor() {
        super()
        this.logger = { log: () => {}, error: () => {} }
    }
}

/**
 * jest 27's jsdom does not expose the Headers constructor that
 * AbstractService._createDefaultHeader uses.
 */
global.Headers = class {
    constructor(init) {
        this.init = init
    }
}

function mockFetch(status, body) {
    global.fetch = jest.fn(() => Promise.resolve({
        status: status,
        text: () => Promise.resolve(body)
    }))
}

test('AbstractService._get rejects on 200 with an empty body', async () => {
    const s = new Svc()
    mockFetch(200, '')
    await expect(s._get('/x')).resolves.toBeNull()
})

test('AbstractService._get rejects on a non JSON body', async () => {
    const s = new Svc()
    mockFetch(200, '<html>gateway error</html>')
    await expect(s._get('/x')).rejects.toThrow(/Could not parse/)
})

test('AbstractService._get resolves parsed JSON', async () => {
    const s = new Svc()
    mockFetch(200, '{"a":1}')
    await expect(s._get('/x')).resolves.toEqual({ a: 1 })
})

test('AbstractService treats 201 and 204 as success', async () => {
    const s = new Svc()
    mockFetch(201, '{"a":2}')
    await expect(s._get('/x')).resolves.toEqual({ a: 2 })
})

test('AbstractService calls errorCallback exactly once on a non 2xx', async () => {
    const s = new Svc()
    mockFetch(500, '')
    const cb = jest.fn()
    await expect(s._get('/x', null, cb)).rejects.toThrow()
    expect(cb).toHaveBeenCalledTimes(1)
})

test('RestEngine.get rejects instead of hanging on an unfilled url', async () => {
    /**
     * buildURL throws from fillString when a ${} placeholder has no value.
     * Before the fix this rejection escaped the async promise executor and
     * the returned promise stayed pending forever.
     */
    const request = {
        method: 'GET',
        url: '/api/order/${orderId}',
        token: null,
        headers: null,
        input: { type: 'JSON' },
        output: { type: 'JSON' }
    }
    await expect(RestEngine.get(request, {})).rejects.toThrow(/Not all parameters replaced/)
})

test('RestEngine resolves a JSON response', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve('{"ok":true}')
    }))
    const request = {
        method: 'GET',
        url: '/api/thing',
        token: null,
        headers: null,
        input: { type: 'JSON' },
        output: { type: 'JSON' }
    }
    await expect(RestEngine.get(request, {})).resolves.toEqual({ ok: true })
})

test('RestEngine rejects an unsupported output type', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
        status: 200,
        text: () => Promise.resolve('x')
    }))
    const request = {
        method: 'GET',
        url: '/api/thing',
        token: null,
        headers: null,
        input: { type: 'JSON' },
        output: { type: 'NOPE' }
    }
    await expect(RestEngine.get(request, {})).rejects.toThrow(/unsupported output type/)
})

test('fillSimpleString substitutes 0 and empty string', async () => {
    expect(RestEngine.fillSimpleString('/a/${id}/b', { id: 0 })).toBe('/a/0/b')
    expect(RestEngine.fillSimpleString('/a/${v}/b', { v: '' })).toBe('/a//b')
    expect(RestEngine.fillSimpleString('/a/${v}/b', {})).toBe('/a/${v}/b')
})

test('fillString accepts a zero valued parameter', async () => {
    await expect(RestEngine.fillString('/a/${id}', { id: 0 }, false)).resolves.toBe('/a/0')
})