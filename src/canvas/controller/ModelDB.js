import Logger from '../../common/Logger'
export default class ModelDB {

  constructor () {
    this.logger =  new Logger('ModelDB')
    this._getDB()
  }


  _getDB() {
    return new Promise((resolve) => {
      if (window && window.indexedDB) {
        if (!this.db) {
          const request = window.indexedDB.open("quxModelDB", 2);
          request.onerror = (event) => {
            this.logger.error('_getDB', 'Could not open DB', event)
          };

          request.onsuccess = (event) => {
            this.logger.log(3, '_getDB', 'Open', event)
            this.db = request.result;
            resolve(this.db)
          };

          request.onupgradeneeded = (event) => {
            this.logger.log(3, '_getDB', 'update', event)
            let db = event.target.result;
            db.createObjectStore("quxModels", {keyPath: "id"});
            db.createObjectStore("quxCommandStacks", {keyPath: "id"});
          }
        } else {
          resolve(this.db)
        }
      } else {
        resolve(null)
      }
    })
  }


  async save (model) {
    this.logger.log(1, 'save', 'enter')
    try {
      let db = await this._getDB()
      if (db) {
        const request = db.transaction(["quxModels"], "readwrite")
        .objectStore("quxModels")
        .put(model);

        request.onsuccess = (event) => {
          this.logger.log(3, 'save', 'success', event)
        };

        request.onerror = (event) =>{
          this.logger.error('save', 'ERROR', event)
        }
      }
    } catch (err){
      this.logger.error('save', 'ERROR', err)
    }
  }

async get (id) {
      this.logger.log(1, 'get', 'enter', id)
      /**
       * Plain async function rather than new Promise(async ...): every exit
       * below already resolves, and the wrapper made the flow harder to
       * follow for no gain.
       */
      try {
        let db = await this._getDB()
        if (db) {
          var transaction = this.db.transaction(["quxModels"]);
          var objectStore = transaction.objectStore("quxModels");
          var request = objectStore.get(id);

          return new Promise((resolve) => {
            request.onerror = () => {
              this.logger.log(-1, 'get', 'error')
              resolve(null)
            };

            request.onsuccess = () => {
              this.logger.log(3, 'get', 'success')
              resolve(request.result)
            };
          });
        }
        return null
      } catch (err){
        this.logger.error('get', 'ERROR', err)
        return null
      }
    }
}