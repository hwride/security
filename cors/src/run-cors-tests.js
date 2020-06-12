const puppeteer = require('puppeteer')
const path = require('path')
const { setupServers, shutdownServers } = require('./servers')
const { sendCapturingOfBrowserRequestData, mergeRawCDPRequestData } = require('./cdp-request-logging')
const { setupLogging, createLogger, logColours } = require('./logging')
const saveResultsAsHTML = require('./results-html-creator')
const config = require('./config')

const logger = createLogger('run-cors-tests')

const SERVER_1 = 'http://localhost:8080'
const SERVER_2 = 'http://localhost:8081'
const RESULTS_PATH = path.resolve(__dirname + '/../generated/results.html')

runCorsTests()

async function runCorsTests() {
    setupLogging()
    const servers = setupServers()

    // Setup browser.
    const browser = await puppeteer.launch(config.puppeteer)

    // Setup page.
    const page = await browser.newPage()
    setupPageLogging(page)
    const browserRawCDPRequestData = await sendCapturingOfBrowserRequestData(page)

    await page.goto(SERVER_1)
    await setupPageUtilFunctions(page)

    // Make test requests.
    const allRequestData = await makeRequests(page, browserRawCDPRequestData, [
        {
            name: 'Origin: same<br/>CORS aware: <span class="error">no</span>',
            notes: `This is just a regular request.`,
            url: `${SERVER_1}/regular-endpoint`,
            requestOptions: { mode: 'same-origin' },
        },
        {
            name: 'Origin: same<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="error">none</span>',
            notes: `This shows even with CORS disabled the same origin can still use the endpoint.`,
            url: `${SERVER_1}/cors-disabled-endpoint`,
            requestOptions: { mode: 'same-origin' },
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="error">no</span>',
            notes: `The CORS protocol is designed to work without any changes to existing server implementations. This
means a request to an endpoint with no CORS knowledge will be sent and processed, but the response won't be exposed
to the client.`,
            url: `${SERVER_2}/regular-endpoint`,
            expectBlockedRequest: true
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="error">no</span><br/><code>mode: \'no-cors\'</code>',
            url: `${SERVER_2}/regular-endpoint`,
            requestOptions: { mode: 'no-cors' },
            notes: `When <code>mode: no-cors</code> is enabled cross-origin requests can be made if using a simple 
request. But note the response is opaque - nothing is readable by the script.`
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="error">none</span>',
            url: `${SERVER_2}/cors-disabled-endpoint`,
            expectBlockedRequest: true
        },
        {
            name: 'Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="success">none</span>',
            url: `${SERVER_2}/cors-all-allowed-endpoint`
        }
    ])

    // Write results
    logger.debug(JSON.stringify(allRequestData, null, 2))
    printRequestDataSimple(allRequestData)

    const resultsDir = path.dirname(RESULTS_PATH)
    if(fs.existsSync(resultsDir)) fs.rmdirSync(resultsDir, { recursive: true })
    fs.mkdirSync(resultsDir)
    saveResultsAsHTML(allRequestData, RESULTS_PATH)

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
                    mode: request.mode,
                    credentials: request.credentials,
                    headers: JSON.stringify(request.headers, null , 2)
                },
                response: {
                    type: response.type,
                    headers: JSON.stringify(response.headers, null , 2)
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
 * @param page Page object.
 * @param browserRawCDPRequestData CDP raw request data object.
 * @param requestsToMake Array of requests to make.
 * @returns {Promise<[]>}
 */
async function makeRequests(page, browserRawCDPRequestData, requestsToMake) {
    const requestData = []

    // Ensure requests happen one at a time so all event capturing we are doing lines up correctly.
    for(const request of requestsToMake) {
        const requestMsg = `Processing request: ${request.name}`
        logger.info('-'.repeat(requestMsg.length))
        logger.info(requestMsg)
        logger.info('-'.repeat(requestMsg.length))

        const thisRequestData = {
            name: request.name,
            notes: request.notes
        }
        requestData.push(thisRequestData)

        // Capture console data for this request.
        thisRequestData.consoleMessages = []
        const captureConsoleMessage = msg => thisRequestData.consoleMessages.push(msg)
        page.on('console', captureConsoleMessage)

        Object.assign(thisRequestData, await sendRequestAndCaptureScriptData(page, request.url, request.requestOptions, request.expectBlockedRequest))
        page.off('console', captureConsoleMessage)
        logger.info('')
    }

    // Sometimes at least the final request did not have the information provided by Network.responseReceivedExtraInfo
    // event. Not sure how to ensure we know if that event has been fired or not. Blunt hack here to just wait a second
    // at the end for any of these events to filter through.
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Merge the browser request data with the CDP logged request data.
    const cdpRequestData = mergeRawCDPRequestData(browserRawCDPRequestData)
    requestData.forEach(singleRequestData => {
        const cdpDataForRequest = cdpRequestData[singleRequestData.cdpRequestID]
        singleRequestData.requestSentByBrowser = cdpDataForRequest.request
        singleRequestData.responseReceivedByBrowser = cdpDataForRequest.response
    })
    return requestData
}

async function sendRequestAndCaptureScriptData(page, url, requestOptions, expectBlockedRequest) {
    const waitForRequestPromise = page.waitForRequest(url)
    const responseScript = await page.evaluate((url, requestOptions = {}, expectBlockedRequest) => {
        return sendRequestAndCaptureDataScript(url, requestOptions, !expectBlockedRequest)
    }, url, requestOptions, expectBlockedRequest)
    const requestBrowser = await waitForRequestPromise
    return {
        cdpRequestID: requestBrowser._requestId,
        requestSentByScript: responseScript.request,
        responseReceivedByScript: responseScript.response
    }
}

function printRequestDataSimple(allRequestData) {
    const logMsg = 'Request results'
    logger.info('-'.repeat(logMsg.length))
    logger.info(logMsg)
    logger.info('-'.repeat(logMsg.length))
    allRequestData.forEach(requestData => {
        const {
            requestSentByScript,
            requestSentByBrowser,
            responseReceivedByBrowser,
            responseReceivedByScript,
            consoleMessages,
        } = requestData
        let out = `${requestData.name}\n`

        // Request.
        out += `${requestSentByBrowser.request.method} ${requestSentByBrowser.request.url}`

        // Response.
        const emptyCheck = (obj, key) => obj[key] != null ? obj[key] : `[No ${key}]`
        out += `\n${emptyCheck(responseReceivedByBrowser.response, 'status')} `
        out += `${emptyCheck(responseReceivedByBrowser.response, 'statusText')}`
        out += `\nBrowser body: ${emptyCheck(responseReceivedByBrowser.response, 'body')}`
        out += `\nScript body: ${emptyCheck(responseReceivedByScript, 'body')}`

        // Errors.
        if(responseReceivedByScript.error) {
            out += logColours.ERROR(`\nScript received an error: ${responseReceivedByScript.error}`)
        }

        // Console messages.
        if(consoleMessages.length > 0) {
            out += `\nConsole messages: `
            consoleMessages.forEach(msg => {
                let logLevel
                if(msg.type() === 'error') {
                    logLevel = 'ERROR'
                } else {
                    logLevel = 'INFO'
                }
                const colourFunc = logColours[logLevel]
                out += '\n' + colourFunc(`[${logLevel}] ${msg.text()}`)
            })
        }

        out += '\n'
        logger.info(out)
    })
}