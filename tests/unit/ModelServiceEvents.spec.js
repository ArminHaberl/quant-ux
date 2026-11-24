/**
 * Regression for the study data that never loaded.
 *
 * The browser hung on the Test tab because GET /rest/events/{appID} answered
 * nothing at all: the backend built the complete log as a List, a JsonArray
 * and one pretty printed String, and for 372k events (~230 MB) that blew the
 * 1.9 GB heap with an OutOfMemoryError before the response was ended. The
 * streaming variant (&batch=true) pumps the documents one by one and stays
 * flat, so findEvents has to ask for it.
 *
 * The pump path skips MongoREST.cleanJson(), which is the only thing that
 * copies _id onto id. TestTab hands a SessionStart event to updateEvent(),
 * so the id has to be promoted on the client or renaming a test breaks.
 */
import { ModelService } from '../../src/services/ModelService'

function createService (response) {
  const service = new ModelService()
  service.requested = []
  service._get = (url) => {
    service.requested.push(url)
    return Promise.resolve(response)
  }
  return service
}

describe('ModelService.findEvents', () => {

  it('reads the event log over the streaming endpoint', () => {
    const service = createService([])
    return service.findEvents('6adb21363e6950046de5ace4').then(() => {
      expect(service.requested).toEqual([
        '/rest/events/6adb21363e6950046de5ace4.json?exclude=Animation&batch=true'
      ])
    })
  })

  it('promotes the mongo _id to id because the pump skips cleanJson', () => {
    const service = createService([
      { _id: 'e1', type: 'SessionStart' },
      { _id: 'e2', type: 'WidgetClick' }
    ])
    return service.findEvents('app').then(events => {
      expect(events.map(e => e.id)).toEqual(['e1', 'e2'])
    })
  })

  it('keeps an id that is already there', () => {
    const service = createService([{ _id: 'e1', id: 'explicit' }])
    return service.findEvents('app').then(events => {
      expect(events[0].id).toBe('explicit')
    })
  })

  it('leaves a non array payload alone', () => {
    const service = createService(null)
    return service.findEvents('app').then(events => {
      expect(events).toBeNull()
    })
  })

  it('propagates a failed request so the caller can clear its spinner', () => {
    const service = new ModelService()
    service._get = () => Promise.reject(new Error('boom'))
    return expect(service.findEvents('app')).rejects.toThrow('boom')
  })
})
