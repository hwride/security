const puppeteer = require('puppeteer')
const path = require('path')
const { setupServers, shutdownServers } = require('./servers')
const { setupLogging, createLogger, logColours } = require('./logging')
const saveResultsAsHTML = require('./results-html-creator')
const config = require('./config')

const logger = createLogger('run-cors-tests')

// The browser will make requests to the proxy ports which will record all the request info.
// The actual servers are under the main ports.
const server1 = `http://localhost:${config.ports.server1.proxy}`
const server2 = `http://localhost:${config.ports.server2.proxy}`

const resultsPath = path.resolve(__dirname + '/../generated/results.html')

runCorsTests()

async function runCorsTests() {
    setupLogging()
    const servers = setupServers({
        server1MainPort: config.ports.server1.main,
        server2MainPort: config.ports.server2.main,
        server1ProxyPort: config.ports.server1.proxy,
        server2ProxyPort: config.ports.server2.proxy
    })

    // Setup browser.
    const browser = await puppeteer.launch(config.puppeteer)

    // Setup page.
    const page = await browser.newPage()
    setupPageLogging(page)

    await page.goto(server1)
    await setupPageUtilFunctions(page)

    // Make test requests.
    const allRequestData = await makeRequests(page, servers.proxyServers,[
        {
            name: 'Origin: same<br/>CORS aware: <span class="error">no</span>',
            notes: `This is just a regular request.`,
            url: `${server1}/regular-endpoint`,
            requestOptions: { mode: 'same-origin' },
        },
        {
            name: 'Origin: same<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="error">none</span>',
            notes: `This shows even with CORS disabled the same origin can still use the endpoint.`,
            url: `${server1}/cors-disabled-endpoint`,
            requestOptions: { mode: 'same-origin' },
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="error">no</span>',
            notes: `The CORS protocol is designed to work without any changes to existing server implementations. This
means a request to an endpoint with no CORS knowledge will be sent and processed, but the response won't be exposed
to the client.`,
            url: `${server2}/regular-endpoint`,
            expectNoResponseBody: true
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="error">no</span><br/><code>mode: \'no-cors\'</code>',
            url: `${server2}/regular-endpoint`,
            requestOptions: { mode: 'no-cors' },
            notes: `When <code>mode: no-cors</code> is enabled cross-origin requests can be made if using a simple
request. But note the response is opaque - nothing is readable by the script.`
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="error">none</span>',
            notes: `A cross-origin request denied due to server configuration.`,
            url: `${server2}/cors-disabled-endpoint`,
            expectNoResponseBody: true
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="success">all</span>',
            notes: `A cross-origin request allowed due to server configuration.`,
            url: `${server2}/cors-all-allowed-endpoint`
        },
        {
            name: `Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
<code>mode: 'same-origin'</code>`,
            notes: `If you try and make a cross-origin request with <code>mode: 'same-origin'</code> it will fail before
the request is even sent, even for a endpoint that would support cross-origin requests for that origin.`,
            url: `${server2}/cors-all-allowed-endpoint`,
            requestOptions: { mode: 'same-origin' },
            expectNoResponseBody: true,
            expectBlockedRequest: true
        }
    ], servers)

    const resultsDir = path.dirname(resultsPath)
    if(fs.existsSync(resultsDir)) fs.rmdirSync(resultsDir, { recursive: true })
    fs.mkdirSync(resultsDir)
    saveResultsAsHTML(allRequestData, resultsPath)

    // Tear down browser.
    await browser.close();
    shutdownServers(servers)
}

function setupPageLogging(page) {
    page.on('console', msg => logger.info('[Page] ' + msg.text()))
}

/**
 * Sets up a global function on the page which will send a request and capture its request data.
 */
async function setupPageUtilFunctions(page) {
    await page.evaluate(async () => {
        window.sendRequestAndCaptureDataScript = async function(url, requestOptions, readBody = true) {
            const request = new Request(url, requestOptions)
            let response
            try {
                response = await fetch(request)
            } catch(e) {
                response = e
            }
            const data = {
                request: {
                    method: request.method,
                    url: request.url,
                    mode: request.mode,
                    credentials: request.credentials,
                    headers: JSON.stringify(request.headers, null , 2)
                },
                response: {
                    type: response.type,
                    headers: JSON.stringify(response.headers, null , 2),
                    status: response.status,
                    statusText: response.statusText
                }
            }
            if(response instanceof Error) {
                data.response.error = `${response.name}: ${response.message}`
            }
            if(readBody) {
                data.response.body = await response.text()
            }
            return data
        }
    })
}

/**
 * Make some requests logging data about those requests.
 * @param page Page object. We will trigger requests and capture script request data from here.
 * @param proxyServers Proxy servers requests are made via, we will capture server request data from here.
 * @param requestsToMake Array of requests to make.
 * @returns {Promise<[]>}
 */
async function makeRequests(page, proxyServers, requestsToMake) {
    const requestData = []

    // Ensure requests happen one at a time so all event capturing we are doing lines up correctly.
    for(const request of requestsToMake) {
        const requestMsg = `Processing request: ${request.name}`
        logger.info('-'.repeat(requestMsg.length))
        logger.info(requestMsg)
        logger.info('-'.repeat(requestMsg.length))

        const thisRequestData = {
            name: request.name,
            notes: request.notes,
            expectBlockedRequest: request.expectBlockedRequest,
            expectNoResponseBody: request.expectNoResponseBody,
        }
        requestData.push(thisRequestData)

        // Capture console data for this request.
        thisRequestData.consoleMessages = []
        const captureConsoleMessage = msg => thisRequestData.consoleMessages.push(msg)
        page.on('console', captureConsoleMessage)

        // Capture server request data via the proxies for this request.
        const setupProxyListeners = name => {
            thisRequestData[name] = { requests: [], responses: [] }
            proxyServers[name].on('request-finished', data => thisRequestData[name].requests.push(data))
            proxyServers[name].on('response-finished', data => thisRequestData[name].responses.push(data))
        }
        setupProxyListeners('proxyServer1')
        setupProxyListeners('proxyServer2')

        Object.assign(thisRequestData, await sendRequestAndCaptureScriptData(page, request.url, request.requestOptions,
          request.expectNoResponseBody, request.expectBlockedRequest))

        // Remove per-request event listeners.
        page.off('console', captureConsoleMessage)
        const removeProxyEventListeners = name => {
            proxyServers[name].off('request-finished')
            proxyServers[name].off('response-finished')
        }
        removeProxyEventListeners('proxyServer1')
        removeProxyEventListeners('proxyServer2')

        logger.info('')
    }

    return requestData
}

async function sendRequestAndCaptureScriptData(page, url, requestOptions, expectNoResponseBody, expectBlockedRequest) {
    const waitForRequestPromise = expectBlockedRequest ? Promise.resolve() : page.waitForRequest(url)
    const responseScript = await page.evaluate((url, requestOptions = {}, expectNoResponseBody) => {
        return sendRequestAndCaptureDataScript(url, requestOptions, !expectNoResponseBody)
    }, url, requestOptions, expectNoResponseBody)
    const requestBrowser = await waitForRequestPromise
    return {
        cdpRequestID: expectBlockedRequest ? null : requestBrowser._requestId,
        requestSentByScript: responseScript.request,
        responseReceivedByScript: responseScript.response
    }
}