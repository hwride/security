const puppeteer = require('puppeteer')
const { setupServers, shutdownServers } = require('./servers')
const { sendCapturingOfBrowserRequestData, mergeRawCDPRequestData } = require('./cdp-request-logging')
const { setupLogging, createLogger } = require('./logging')
var logger = createLogger('run-cors-tests')

const SERVER_1 = 'http://localhost:8080'
const SERVER_2 = 'http://localhost:8081'

runCorsTests()

/*
 Ideal data:
 name
 request data from script
 request data from browser
 whether server processes request
 response data to browser
 response data to script
 */

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
    await Promise.all(requestsToMake.map(async (request) => {
        const thisRequestData = {
            name: request.name
        }
        requestData.push(thisRequestData)
        Object.assign(thisRequestData, await sendRequestAndCaptureScriptData(page, request.url, request.expectBlockedRequest))
    }))

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
        requestSeenByScript: responseScript.request,
        responseSeenByScript: responseScript.response
    }
}

function printRequestDataSimple(allRequestData) {
    allRequestData.forEach(requestData => {
        const {
            requestSeenByScript,
            requestSentByBrowser,
            responseReceivedByBrowser,
            responseSeenByScript
        } = requestData
        let out = `${requestData.name}\n`
        out += `${requestSentByBrowser.request.method} ${requestSentByBrowser.request.url}`
        const emptyCheck = (obj, key) => obj[key] != null ? obj[key] : `[No ${key}]`
        out += `\n${emptyCheck(responseReceivedByBrowser.response, 'status')} `
        out += `${emptyCheck(responseReceivedByBrowser.response, 'statusText')}`
        if(responseSeenByScript.error) {
            out += `\nScript received an error: ${responseSeenByScript.error}`
        }
        out += '\n'
        logger.info(out)
    })
}