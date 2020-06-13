const puppeteer = require('puppeteer')
const path = require('path')
const { setupServers, shutdownServers } = require('./servers')
const { setupLogging, createLogger, logColours } = require('./logging')
const saveResultsAsHTML = require('./results-html-creator')

const config = require('./config')
const testDefinitions = require('./test-definitions')

const logger = createLogger('run-cors-tests')

// The browser will make requests to the proxy ports which will record all the request info.
// The actual servers are under the main ports.
const server1 = `http://localhost:${config.ports.server1.proxy}`
const server2 = `http://localhost:${config.ports.server2.proxy}`

const resultsPath = path.resolve(__dirname + '/../generated/results.html')

runCorsTests()

async function runCorsTests() {
    setupLogging()

    // Setup servers.
    const servers = setupServers({
        server1MainPort: config.ports.server1.main,
        server2MainPort: config.ports.server2.main,
        server1ProxyPort: config.ports.server1.proxy,
        server2ProxyPort: config.ports.server2.proxy
    })

    // Setup page.
    const browser = await puppeteer.launch(config.puppeteer)
    const page = await browser.newPage()
    setupPageLogging(page)

    await page.goto(server1)
    await setupPageUtilFunctions(page)

    // Make test requests.
    const testDefsReplaced = testDefinitions.map(testDef => ({
        ...testDef,
        url: testDef.url.replace('${server1}', server1).replace('${server2}', server2)
    }))
    const allRequestData = await makeRequests(page, servers.proxyServers, testDefsReplaced)

    // Save results to file.
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