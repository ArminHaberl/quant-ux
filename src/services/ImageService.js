import Logger from 'common/Logger'
import AbstractService from './AbstractService'

class ImageService extends AbstractService {

  constructor () {
    super()
    this.logger = new Logger('ImageService')
  }

  delete (model, image) {
    return this._delete("/rest/images/" + model.id + "/" + image.id + "/" + image.url)
  }

  upload (url, formData, progressHandler) {
    this.logger.log(-1, "upload", "enter");
    return new Promise((resolve, reject) => {
    	// now post a new XHR request
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      if (progressHandler) {
        xhr.onprogress = progressHandler
      }

      if (this.token) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
      } else {
        this.logger.error("upload", "No token");
        this.logger.sendError(new Error('Could not upload because no token'))
      }

      /**
       * An XHR does not time out on its own, so without this a request that
       * never gets a response leaves the caller awaiting forever.
       */
      xhr.timeout = 300000

      const fail = (reason, status) => {
        let detail = ''
        if (typeof xhr.response === 'string' && xhr.response.length > 0) {
          detail = xhr.response.length > 500 ? xhr.response.substring(0, 500) : xhr.response
        }
        let message = 'Could not upload to ' + url
        if (status) {
          message += ' (HTTP ' + status + ')'
        }
        if (reason) {
          message += ': ' + reason
        }
        if (detail) {
          message += ' > ' + detail
        }
        let error = new Error(message)
        error.status = status
        this.logger.error('upload', message)
        this.logger.sendError(error)
        reject(error)
      }

      /**
       * Arrow function on purpose: as a plain function handler `this` is the
       * XHR and not this service, which used to throw on every failed upload
       * before reject() was reached and hang the caller instead.
       */
      xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(xhr.response);
          } else {
            fail(null, xhr.status)
          }
      };
      xhr.onerror = () => fail('network error')
      xhr.ontimeout = () => fail('timeout')
      xhr.onabort = () => fail('aborted')
      xhr.send(formData);
    })
  }
}



export default new ImageService()