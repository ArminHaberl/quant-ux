const http = require('http')
const https = require('https')
const express = require('express')
const path = require('path')
const compression = require('compression')
const proxyMiddleware = require('http-proxy-middleware')

/**
 * Some config stuff
 */
const host = '0.0.0.0'
const assetsRoot = path.resolve(__dirname, '../dist')
const port = (process.env.QUX_HTTP_PORT * 1) || 8082
const proxyUrl = process.env.QUX_PROXY_URL || 'https://v1.quant-ux.com'
const wsUrl = process.env.QUX_WS_URL || 'wss://ws.quant-ux.com'
const auth = process.env.QUX_AUTH || 'qux'
const tos = process.env.QUX_TOS_URL || ''
const keycloak_realm = process.env.QUX_KEYCLOAK_REALM || ''
const keycloak_client = process.env.QUX_KEYCLOAK_CLIENT || ''
const keycloak_url = process.env.QUX_KEYCLOAK_URL || ''
const sharedLibs = process.env.QUX_SHARED_LIBS || ''
const userAllowSignUp = process.env.QUX_USER_ALLOW_SIGNUP !== 'false'
const userAllowedDomains = process.env.QUX_USER_ALLOWED_DOMAINS || '*'
const recaptchaSiteKey = process.env.QUX_RECAPTCHA_SITE_KEY || ''
const recaptchaSecret = process.env.QUX_RECAPTCHA_SECRET || ''
const recaptchaThreshold = (process.env.QUX_RECAPTCHA_THRESHOLD * 1) || 0.5

/**
 *
 * Init express
 */
var app = express()

/** 
 * Add compression
 */
app.use(compression())


/** 
 * make config dynamic on env variables
 */
app.get("/config.json", (_req, res) => {
  res.send({
    "auth": auth,
    "websocket": wsUrl,
    "tos": tos,
    "sharedLibs": sharedLibs,
    "user": {
      "allowSignUp": userAllowSignUp,
      "allowedDomains": userAllowedDomains
    },
    "recaptcha": {
      "siteKey": recaptchaSiteKey,
      "threshold": recaptchaThreshold
    },
    "keycloak": {
      "realm": keycloak_realm,
      "clientId": keycloak_client,
      "url": keycloak_url
    }
  })
})

/**
 * Verify a reCAPTCHA token against the Google siteverify API.
 * The secret key never leaves the server.
 */
function verifyRecaptcha (token, remoteip) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams()
    body.append('secret', recaptchaSecret)
    body.append('response', token)
    if (remoteip) {
      body.append('remoteip', remoteip)
    }
    const data = body.toString()
    const req = https.request({
      hostname: 'www.google.com',
      port: 443,
      path: '/recaptcha/api/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = ''
      res.on('data', (chunk) => {
        raw += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

/**
 * Fail-closed: if reCAPTCHA is not configured we reject the request,
 * so a misconfigured admin notices instead of silently letting bots through.
 */
app.post("/captcha/verify", express.json(), async (req, res) => {
  if (!recaptchaSecret || !recaptchaSiteKey) {
    res.status(503).json({ success: false, error: 'recaptcha not configured' })
    return
  }
  const token = req.body && req.body.token
  if (!token) {
    res.status(400).json({ success: false, error: 'missing token' })
    return
  }
  try {
    const data = await verifyRecaptcha(token, req.body && req.body.remoteip)
    const success = data.success === true && data.score !== undefined && data.score >= recaptchaThreshold
    res.json({ success: success, score: data.score })
  } catch (e) {
    console.error('recaptcha verify failed', e)
    res.status(502).json({ success: false, error: 'recaptcha verify failed' })
  }
})

/**
 * init proxy.
 */
app.use('/rest/', proxyMiddleware.createProxyMiddleware({
    target: proxyUrl,
    changeOrigin: true
}))

app.use('/ai/', proxyMiddleware.createProxyMiddleware({
  target: proxyUrl,
  changeOrigin: true
}))


/**
 * Setup static to serve all html, js and images from server/dist
 */
app.use(express.static(assetsRoot))


/**
 * Create the server
 */
var server = http.createServer(app)


// Finish application create.
module.exports = server.listen(port, function (err) {
  if (err) {
    console.log(err)
    return
  }
  console.debug(' ______     __  __     ______     __   __     ______   __  __     __  __')
  console.debug('/\\  __ \\   /\\ \\/\\ \\   /\\  __ \\   /\\ "-.\\ \\   /\\__  _\\ /\\ \\/\\ \\   /\\_\\_\\_\\ ')
  console.debug('\\ \\ \\/\\_\\  \\ \\ \\_\\ \\  \\ \\  __ \\  \\ \\ \\-.  \\  \\/_/\\ \\/ \\ \\ \\_\\ \\  \\/_/\\_\\/_')
  console.debug(' \\ \\___\\_\\  \\ \\_____\\  \\ \\_\\ \\_\\  \\ \\_\\\\"\\_\\    \\ \\_\\  \\ \\_____\\   /\\_\\/\\_\\ ')
  console.debug('  \\/___/_/   \\/_____/   \\/_/\\/_/   \\/_/ \\/_/     \\/_/   \\/_____/   \\/_/\\/_/ ')
  console.log('Listening on ' + host + ':' + server.address().port)
  console.log('Backend   : ' + proxyUrl)
  console.log('WebSocket : ' + wsUrl)
  console.log('Auth      : ' + auth)
  console.log('SignUp    : ' + userAllowSignUp)
  console.log('Domains   : ' + userAllowedDomains)
  console.log('reCAPTCHA : ' + (recaptchaSiteKey ? 'enabled (threshold ' + recaptchaThreshold + ')' : 'disabled'))
})







