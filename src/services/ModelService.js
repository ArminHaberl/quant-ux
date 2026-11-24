import AbstractService from 'services/AbstractService'
import Logger from 'common/Logger'

export class ModelService extends AbstractService{

    constructor () {
        super()
        this.logger = new Logger('ModelService')
    }

    createApp (model) {
        this.logger.log(1, 'createApp', 'enter', model)
        return this._post('rest/apps/', model)
    }

    updateAppProps (id, change) {
        return this._post(`/rest/apps/props/${id}.json`, change)
    }

    saveApp (model) {
        this.logger.log(1, 'saveApp', 'enter', model)
        return this._post(`/rest/apps/${model.id}.json`, model)
    }

    copyApp (model, newName) {
        this.logger.warn('copyApp', 'enter', model)
        return this._post(`/rest/apps/copy/${model.id}`, {"name" : newName})
    }

    updateApp (model, changes) {
        this.logger.log(4, 'updateApp', 'enter', changes)
        return this._post(`/rest/apps/${model.id}/update`, changes)
    }

    deleteApp (model) {
        this.logger.log(-1,'deleteApp', 'enter', model)
        return this._delete(`/rest/apps/${model.id}.json`)
    }

    findPublicSummaries () {
        return this._get('rest/apps/public?summary=true')
    }

    findMyAppSummaries () {
        return this._get('rest/apps/?summary=true')
    }

    findPublic () {
        return this._get('rest/apps/public')
    }

    findMyApps () {
        return this._get('rest/apps/')
    }

    findApp (id) {
        return this._get(`/rest/apps/${id}.json`)
    }

    findAppByHash (hash) {
        return this._get(`/rest/invitation/${hash}/app.json`)
    }

    checkAppUpdateByHash (hash) {
        return this._get(`/rest/invitation/${hash}/update.json`)
    }

    findImages(id) {
        return this._get(`/rest/images/${id}.json`)
    }

    /**
     * Commands
     */

    getCommands (id) {
        return this._get(`/rest/commands/${id}.json`)
    }

    saveCommands (id, stack) {
        return this._post(`/rest/commands/${id}.json`, stack)
    }

    addCommand (model, command) {
        return this._post(`/rest/commands/${model.id}/add`, command)
    }

    deleteCommand (model, count) {
        return this._delete(`/rest/commands/${model.id}/pop/${count}`)
    }

    shiftStack (model, count) {
        return this._delete(`/rest/commands/${model.id}/shift/${count}`)
    }

    undoCommand (model, command) {
        return this._post(`/rest/commands/${model.id}/undo`, command)
    }

    redoCommand (model, command) {
        return this._post(`/rest/commands/${model.id}/redo`, command)
    }

    /**
     * Team
     */
    findTeam (id) {
        return this._get(`/rest/apps/${id}/team.json`)
    }

    findTeamSuggestions (id) {
        return this._get(`/rest/apps/${id}/suggestions/team.json`)
    }

    createTeam (id, user) {
        return this._post(`/rest/apps/${id}/team/`, user)
    }

    updateTeam (id, user) {
        return this._post(`/rest/apps/${id}/team/${user.id}.json`, user)
    }

    deleteTeam (id, user) {
        return this._delete(`/rest/apps/${id}/team/${user.id}.json`)
    }

    resetTeam(id) {
        return this._delete(`/rest/apps/invitation/${id}`)
    }

    /**
     * Events
     */
    saveEvent (id, hash, event) {
        return this._post(`/rest/invitation/${id}/${hash}/events.json`, event)
    }

    /**
     * The complete event log is read over the streaming endpoint. The plain
     * findBy() path makes the backend materialise the result three times: a
     * List<JsonObject>, a JsonArray and one pretty printed String that
     * response().end() encodes a fourth time. For the bigger studies that is
     * ~230 MB of JSON and it blows the 1.9 GB JVM heap with an
     * OutOfMemoryError, which leaves the request unanswered forever. With
     * batch=true the server pumps document by document (204 MB for
     * Final_Experiment in 37s, flat memory).
     *
     * MongoResultPump skips MongoREST.cleanJson(), so the documents only
     * carry the mongo _id. The rest of the app talks about event.id - e.g.
     * TestTab passes a SessionStart event to updateEvent() - so promote it
     * here, once, before the callers freeze the objects.
     */
    findEvents (id) {
        return this.findEventsBatch(id).then(events => {
            if (Array.isArray(events)) {
                for (let i = 0; i < events.length; i++) {
                    if (!events[i].id) {
                        events[i].id = events[i]._id
                    }
                }
            }
            return events
        })
    }

    findEventsBatch (id) {
        return this._get(`/rest/events/${id}.json?exclude=Animation&batch=true`)
    }

    countEvents (id) {
        return this._get(`/rest/events/${id}/all/count.json`)
    }

    findEventsBySession (id, session) {
        return this._get(`/rest/events/${id}/${session}.json`)
    }

    deleteEventsBySession (id, session) {
        return this._delete(`/rest/events/${id}/${session}.json`)
    }

    updateEvent (appID, event) {
        return this._post(`/rest/events/${appID}/${event.id}.json`, event)
    }

    /**
     * Mouse
     */
    findMouse (id) {
        return this._get(`/rest/mouse/${id}.json`)
    }

    findMouseBySession (id, session) {
        return this._get(`/rest/mouse/${id}/${session}.json`)
    }

    saveMouse (id, hash, events) {
        return this._post(`/rest/invitation/${id}/${hash}/mouse.json`, events)
    }

    deleteMouseBySession (id, session) {
        return this._delete(`/rest/mouse/${id}/${session}.json`)
    }


    /**
     * Annotations
     */
    findSessionAnnotations (id) {
        if (!id) {
            this.logger.error('findSessionAnnotations', 'error', 'no id passed')
            this.logger.sendError(new Error())
        }
        return this._get(`/rest/annotations/apps/${id}/session.json`)
    }

    findTagAnnotations (id) {
        return this._get(`/rest/annotations/apps/${id}/tags.json`)
    }

    deleteAnnotation (id, annotationId) {
        return this._delete(`/rest/annotations/apps/${id}/${annotationId}.json`)
    }

    saveAnnotation (id, annotation) {
        return this._post(`/rest/annotations/apps/${id}`, annotation)
    }

    updateAnnotation (id, annotation) {
        return this._post(`/rest/annotations/apps/${id}/${annotation.id}.json`, annotation)
    }

    /**
     * Inivitations
     */
    findInvitation (id) {
        return this._get(`/rest/invitation/${id}.json`)
    }

    /**
     * Test
     */
    findTest (id) {
        return this._get(`/rest/test/${id}.json`)
    }

    findTestByHash (app, hash) {
        return this._get(`/rest/invitation/${app.id}/${hash}/test.json`)
    }

    saveTestSettings (id, test) {
        return this._post(`/rest/test/${id}.json`, test)
    }


    /**
     * Examples
     */
    findPublicMouse (id) {
        return this._get(`/examples/mouse/${id}.json`)
    }

    findPublicMouseBySession (appId, sessionId) {
        return this._get(`/examples/mouse/${appId}/${sessionId}.json`)
    }

    findPublicEventsBySession (appId, sessionId) {
        return this._get(`/examples/events/${appId}/${sessionId}.json`)
    }

    findPublicTagAnnotations (id) {
        return this._get(`/examples/annotations/apps/${id}/tags.json`)
    }
}
export default new ModelService()
