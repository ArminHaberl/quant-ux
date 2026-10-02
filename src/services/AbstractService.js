export default class AbstractService {

    constructor () {
        this.token = null
    }

    setToken (token) {
        this.token = token
    }

    _createDefaultHeader() {
        if (this.token) {
            let headers = new Headers({
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + this.token
            })
            this.addHeaders(headers)
            return headers
        } else {
            let headers = new Headers({
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            })
            this.addHeaders(headers)
            return headers
        }
    }

    /**
     * Expention point for child classes. The can add custom headers
     * to a request by overwritting this method.
     */
    addHeaders() {}

    /**
     * A 2xx that is not exactly 200 still carries a result (201, 202, 204).
     */
    _isSuccess (res) {
        return res.status >= 200 && res.status < 300
    }

    /**
     * Read the body once and parse it, tolerating an empty body and
     * reporting a malformed one as a rejection.
     *
     * This used to be `res.json().then(j => {...})` with no catch on the
     * inner promise. The outer catch cannot see an inner rejection, so a
     * 200 with an empty or non JSON body (a DELETE, or a proxy that
     * returned an HTML error page with a 200) left the returned promise
     * pending forever and every `await` on it hung.
     */
    _parseJSON (res, url) {
        return res.text().then((text) => {
            if (!text) {
                return null
            }
            try {
                return JSON.parse(text)
            } catch (e) {
                throw new Error('Could not parse response from ' + url + ': ' + e.message)
            }
        })
    }

    /**
     * Single place that does the fetch, the status check and the body parse.
     * Rejects on any non 2xx so callers do not each reimplement it.
     */
    _request (url, options, label) {
        return fetch(url, options).then((res) => {
            if (this._isSuccess(res)) {
                return this._parseJSON(res, url)
            }
            this.onError(url, res)
            throw new Error('Could not ' + label + ' ' + url)
        })
    }

    _getChached (url, successCallback, errorCallback) {
        this.logger.log(6, '_getChached', 'enter ', url)
        return new Promise((resolve, reject) => {
            /**
             * 1st check cache
             */
            if (this._cache && this._cache[url]) {
                this.logger.log(6, '_getChached', 'exit (cache) ')
                resolve(this._cache[url])
                return
            }

             /**
              * else do fetch
              */
            this._request(url, {
                method: 'get',
                credentials: "same-origin",
                headers: this._createDefaultHeader()
            }, 'load').then((j) => {
                this.logger.log(6, '_getChached', 'exit (fetch)')
                if (!this._cache) {
                    this._cache = {}
                }
                this._cache[url] = j
                resolve(j)
                if (successCallback) {
                    successCallback(j)
                }
            }).catch((err) => {
                if (errorCallback) {
                    errorCallback(err)
                }
                reject(err)
            })
        })
    }

    _get(url, successCallback, errorCallback) {
        this.logger.log(6, '_get', 'enter ' + url)
        return this._request(url, {
            method: 'get',
            credentials: "same-origin",
            headers: this._createDefaultHeader()
        }, 'load').then((j) => {
            this.logger.log(6, '_get', 'exit ')
            if (successCallback) {
                successCallback(j)
            }
            return j
        }).catch((err) => {
            if (errorCallback) {
                errorCallback(err)
            }
            throw err
        })
    }

    _post(url, data, successCallback, errorCallback) {
        this.logger.log(6, '_post', 'enter ' + url)
        return this._request(url, {
            method: 'post',
            credentials: "same-origin",
            body: JSON.stringify(data),
            headers: this._createDefaultHeader()
        }, 'post').then((j) => {
            this.logger.log(6, '_post', 'exit ')
            if (successCallback) {
                successCallback(j)
            }
            return j
        }).catch((err) => {
            if (errorCallback) {
                errorCallback(err)
            }
            throw err
        })
    }

    _put(url, data, successCallback, errorCallback) {
        this.logger.log(6, '_put', 'enter ' + url)
        return this._request(url, {
            method: 'put',
            credentials: "same-origin",
            body: JSON.stringify(data),
            headers: this._createDefaultHeader()
        }, 'put').then((j) => {
            this.logger.log(6, '_put', 'exit ')
            if (successCallback) {
                successCallback(j)
            }
            return j
        }).catch((err) => {
            if (errorCallback) {
                errorCallback(err)
            }
            throw err
        })
    }

    _delete(url, successCallback, errorCallback, header) {
        return this._request(url, {
            method: 'delete',
            headers: this._createDefaultHeader(header)
        }, 'delete').then((j) => {
            if (successCallback) {
                successCallback(j)
            }
            return j
        }).catch((err) => {
            if (errorCallback) {
                errorCallback(err)
            }
            throw new Error('Could not delete')
        })
    }

    setErrorHandler (handler) {
        this.errorHandler = handler
    }

    onError (url, res) {
        if (this.errorHandler) {
            this.errorHandler(url, res)
        }
    }

}