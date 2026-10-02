import AbstractService from './AbstractService'
import Logger from 'common/Logger'
import Keycloak from "keycloak-js";

class KeyCloakService extends AbstractService{

    constructor () {
        super()
        this.language = 'en'
        this.REFRESH_INTERVAl = 60 * 1000
        this.GUEST = {
            id: -1,
            name: "Guest",
            isKeyCloak: true,
            email: "guest@quant-ux.com",
            role: "guest",
            lastlogin: 0,
            lastNotification: 0,
            tos: false,
            paidUntil: 0,
            plan: "Free"
        }
        this.logger = new Logger('KeyCloakService')
    }

    setConf(conf) {
        this.initOptions = {
            url: conf.keycloak.url, 
            realm: conf.keycloak.realm, 
            clientId: conf.keycloak.clientId
        }
    }

init() {
        /**
         * Guarded on initPromise, not isInited: isInited was only set on the
         * authenticated branch, so an unauthenticated init() ran the whole
         * body again and each run armed another refresh interval.
         */
        if (this.initPromise) {
            return this.initPromise
        }
        this.initPromise = new Promise((resolve) => {
            this.logger.log(-1, 'init() > enter')

            const keycloak = Keycloak(this.initOptions);
            this.keycloak = keycloak

            /**
             * keycloak.init() returns a promise and onReady is deprecated, but
             * neither the promise nor its rejection was observed. If init
             * rejected (unreachable server, wrong clientId) onReady never
             * fired, so this promise never settled and load() hung, leaving
             * the studio on a blank screen with no message.
             *
             * On failure we resolve rather than reject, so the caller falls
             * back to the guest user instead of throwing.
             */
            keycloak.init({
              onLoad: 'check-sso',
              silentCheckSsoRedirectUri: window.location.origin + (process.env.BASE_URL || '/').replace(/\/+$/, '') + '/sso.html'
            }).then((authenticated) => {
                if (!authenticated) {
                  this.logger.log(-1, 'init() > need login')
                  keycloak.login()
                  resolve()
                  return
                }
                this.logger.log(-1, 'init() > user logged in')
                keycloak.loadUserProfile().then(async (user) => {
                  this.logger.log(-1, 'init()', 'user loaded', user)
                  const quxUser = {
                    id:user.id,
                    name: user.username,
                    lastname: user.lastname,
                    email: user.username,
                    token: keycloak.token
                  }
                  this.isInited = true
                  this.setUser(quxUser)
                  try {
                    await this._post('/rest/user/external', quxUser)
                  } catch (e) {
                    this.logger.error('init() > could not create external user', e)
                  }
                  resolve()

                  this._refreshInterval = setInterval(async () => {
                    const refreshed = await keycloak.updateToken(300).catch((err) => {
                      this.logger.error('init() > failed to refresh token', err)
                      return false
                    })
                    /**
                     * Do not fall through to setUser() when the refresh
                     * failed: updateToken rejects without touching the
                     * token, so a stale or missing one was being written over
                     * a still good one and the whole app silently degraded
                     * to anonymous.
                     */
                    if (!refreshed || !keycloak.token) {
                      this.logger.error('init() > token refresh failed, keeping current session')
                      return
                    }
                    const quxUser = {
                        id:user.id,
                        name: user.username,
                        lastname: user.lastname,
                        email: user.username,
                        token: keycloak.token
                    }
                    this.setUser(quxUser)
                  }, this.REFRESH_INTERVAl)

                })

            }).catch((err) => {
              this.logger.error('init() > error', err)
              resolve()
            })

            keycloak.onAuthLogout = () => {
              this.logger.log(-1, 'onAuthLogout()')
            }
            this.logger.log(-1, 'init() > exit')
        })
        return this.initPromise
    }

    signup () {
   
    }

    async login () {
    
    }

    save () {
        //return this._post('rest/user/' + userID + ".json", data)
    }

    logout () {
        this.logger.log(-1, 'KeyCloakService.logout()')
        localStorage.removeItem('quxKeyCloakUser');
        /**
         * The refresh interval used to be dropped on the floor, so every
         * login/logout cycle left another timer running forever.
         */
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval)
            this._refreshInterval = null
        }
        this.isInited = false
        this.initPromise = null
        if (this.keycloak) {
            this.keycloak.logout()
        }
    }

    reset () {
    }

    reset2 () {
       
    }

    retire () {
      
    }

    async load () {
       await this.init()
       return this.user
    }

    async loadById (id) {
        return await this._get('/rest/user/' + id + '.json')
    }

    getNotications () {
        return this._get('/rest/notifications.json')
    }

    setLastNotication () {
        return this._post('/rest/user/notification/last.json')
    }

    getLastNotication () {
        return this._get('/rest/user/notification/last.json')
    }

    getUser () {
        return this.user
    }

    getToken () {
        /**
         * We moght have an issue here on forst loads!. Make sure we chhecke the local storage.
         */
        if (!this.user) {
            this.load()
        }

        if (this.user && this.user.token) {
            if (this.isValidUser(this.user)) {
                return this.user.token
            } else {
                this.logger.error('getToken', 'Error > Token has timed out')
                if (this.errorHandler) {
                    this.errorHandler('', {
                        tokenTimedOut: true
                    })
                }
            }
        }
        return null;
    }

    isValidUser (u) {
        if (u.exp && u.exp > 0) {
            if (u.exp > new Date().getTime()) {
                return true
            } else {
                this.logger.error('isValidUser', 'Error > Token has timed out')
                this.logout()
                location.href= "#/"
            }
        }
        return false
    }

    setTTL (u) {
        if (u.token) {
            let jwt = this.parseJwt(u.token)
            if (jwt) {
                // JWT uses seconds
                u.exp = jwt.exp * 1000
                this.logger.log(-1, 'setTTL', 'exit > User valid until', new Date(u.exp))
            } else {
                this.logger.log(-1, 'setTTL', 'exit > NO token')
            }
        }
    }

    parseJwt (token) {
        try {
            var base64Url = token.split('.')[1];
            var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            this.logger.error('parseJwt', 'error > could not parse token', e)
        }
        return null
    }

    setUser (u) {
        this.setTTL(u)
        this.user = u
    }

    setLanguage (langauge) {
        this.language = langauge
        localStorage.setItem('quxLanguage', this.language);
    }

    getLanguage () {
        let s = localStorage.getItem('quxLanguage')
        if (s) {
            this.language = s
        } else {
            this.language = navigator.language
        }
        return this.language
    }

    contact (name, email, message) {
        return this._post("/rest/contact", {
            name: name,
            email: email,
            message: message
        })
    }

    deleteImage (user) {
        return this._delete( "/rest/user/" + user.id + "/images/" + user.image);
    }

}
export default new KeyCloakService()
