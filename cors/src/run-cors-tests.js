const puppeteer = require('puppeteer')
const { setupServers, shutdownServers } = require('./servers')
const { sendCapturingOfBrowserRequestData, mergeRawCDPRequestData } = require('./cdp-request-logging')
const { setupLogging, createLogger, logColours } = require('./logging')

const logger = createLogger('run-cors-tests')

const SERVER_1 = 'http://localhost:8080'
const SERVER_2 = 'http://localhost:8081'

runCorsTests()

async function runCorsTests() {
    setupLogging()
    const servers = setupServers()

    // Setup browser.
    const browser = await puppeteer.launch()

    // Setup page.
    const page = await browser.newPage()
    setupPageLogging(page)
    const browserRawCDPRequestData = await sendCapturingOfBrowserRequestData(page)

    await page.goto(SERVER_1)
    await setupPageUtilFunctions(page)

    // Make test requests.
    const allRequestData = await makeRequests(page, browserRawCDPRequestData, [
        { name: 'Same-origin, regular endpoint', url: `${SERVER_1}/regular-endpoint` },
        { name: 'Same-origin, CORS enabled endpoint', url: `${SERVER_1}/cors-enabled-endpoint` },
        { name: 'Different origin, regular endpoint', url: `${SERVER_2}/regular-endpoint`, expectBlockedRequest: true },
        { name: 'Different origin, CORS enabled endpoint', url: `${SERVER_2}/cors-enabled-endpoint` }
    ])
    logger.debug(JSON.stringify(allRequestData, null, 2))
    printRequestDataSimple(allRequestData)

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
                    headers: JSON.stringify(response.headers, null , 2),
                    bodyNonNull: response.body != null
                }
            }
            if(response instanceof Error) {
                data.response.error = `${response.name}: ${response.message}`
            }
            if(readBody) {
                data.response.body = JSON.stringify(await response.json())
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
            name: request.name
        }
        requestData.push(thisRequestData)

        // Capture console data for this request.
        thisRequestData.consoleMessages = []
        const captureConsoleMessage = msg => thisRequestData.consoleMessages.push(msg)
        page.on('console', captureConsoleMessage)

        Object.assign(thisRequestData, await sendRequestAndCaptureScriptData(page, request.url, request.expectBlockedRequest))
        page.off('console', captureConsoleMessage)
        logger.info('')
    }

    // Merge the browser request data with the CDP logged request data.
    const cdpRequestData = mergeRawCDPRequestData(browserRawCDPRequestData)
    requestData.forEach(singleRequestData => {
        const cdpDataForRequest = cdpRequestData[singleRequestData.cdpRequestID]
        singleRequestData.requestSentByBrowser = cdpDataForRequest.request
        singleRequestData.responseReceivedByBrowser = cdpDataForRequest.response
    })
    return requestData
}

async function sendRequestAndCaptureScriptData(page, url, expectBlockedRequest) {
    const waitForRequestPromise = page.waitForRequest(url)
    const responseScript = await page.evaluate((url, expectBlockedRequest) => {
        return sendRequestAndCaptureDataScript(url, {}, !expectBlockedRequest)
    }, url, expectBlockedRequest)
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