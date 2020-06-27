const path = require('path')
const puppeteer = require('puppeteer')

const { setupProxyServer, shutdownProxyServer } = require('../servers/servers-proxy')
const { createLogger } = require('../framework/logging')
const saveResultsAsHTML = require('../result-writing/results-html-creator')

const logger = createLogger('run-cors-tests')

/**
 * Makes test requests from Chromium dev tools, captures data about the requests, and optionally writes it to HTML for
 * display.
 *
 * The following data is captured:
 * - Request data seen by script.
 * - Request data actually sent by the browser.
 * - Response data received by the browser.
 * - Response data seen by script.
 * - Any errors that occurred in script while performing requests or reading responses.
 *
 * Script requests are made and data captured using Puppeteer.
 * The request data the browser sees is captured by a forward proxy.
 *
 * @param {object} config
 * @return {Promise<Array>}
 */
module.exports = async function testRequests({
    proxyPort,
    mainPageURL,
    testDefinitions,
    resultsPath,
    puppeteerConfig,
}) {
    // Setup.
    const proxyServer = setupProxyServer(proxyPort)
    const { browser, page } = await setupPage(puppeteerConfig, proxyPort, mainPageURL)

    // Make requests.
    const allRequestData = await makeRequests(page, proxyServer, testDefinitions)

    // Save results to file.
    if(resultsPath) {
        saveResultsToFile(resultsPath, allRequestData)
    }

    // Teardown.
    await cleanup(browser, proxyServer)

    return allRequestData
}

async function setupPage(puppeteerConfig, proxyPort, mainPageURL) {
    const browser = await puppeteer.launch({
        ...puppeteerConfig,
        args: [
            `--proxy-server=localhost:${proxyPort}`,
            // Need the following line to get it to work, see: https://github.com/puppeteer/puppeteer/issues/3711#issuecomment-451007780
            '--proxy-bypass-list=<-loopback>'
        ]
    })
    const page = await browser.newPage()
    page.on('console', msg => logger.info('[Page] ' + msg.text()))

    await page.goto(mainPageURL)
    await setupBrowserRequestCapturingFunction(page)

    return { browser, page }
}

/**
 * Sets up a global function on the page which will send a request and capture its request data.
 */
async function setupBrowserRequestCapturingFunction(page) {
    await page.evaluate(async () => {
        window.sendRequestAndCaptureDataScript = async function(url, requestOptions, readBody = true) {
            // Code below to handle errors possibly occurring in request or response.
            let request
            let response
            try {
                request = new Request(url, requestOptions)
            } catch(e) {
                request = e
            }
            try {
                if(!(request instanceof Error)) {
                    request = new Request(url, requestOptions)
                    response = await fetch(request)
                }
            } catch(e) {
                response = e
            }
            const getErrorObj = e => ({ error: true, msg: `${e.name}: ${e.message}` })
            const data = {
                request: request instanceof Error ? getErrorObj(request) : {
                    method: request.method,
                    url: request.url,
                    mode: request.mode,
                    credentials: request.credentials,
                    headers: JSON.stringify(request.headers, null , 2)
                }
            }
            if(response) {
                data.response = {
                    type: response.type,
                    headers: JSON.stringify(response.headers, null , 2),
                    status: response.status,
                    statusText: response.statusText
                }
            } else if(response instanceof Error) {
                data.response = getErrorObj(response)
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
 * @param proxyServer Proxy server requests are made via, we will capture server request data from here.
 * @param requestsToMake Array of requests to make.
 * @returns {Promise<[]>}
 */
async function makeRequests(page, proxyServer, requestsToMake) {
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
            expectNoResponseBody: request.expectNoResponseBody,
        }
        requestData.push(thisRequestData)

        // Capture console data for this request.
        thisRequestData.consoleMessages = []
        const captureConsoleMessage = msg => thisRequestData.consoleMessages.push(msg)
        page.on('console', captureConsoleMessage)

        // Capture server request data via the proxies for this request.
        thisRequestData.proxyServer = { requests: [], responses: [] }
        const captureRequestData = data => thisRequestData.proxyServer.requests.push(data)
        proxyServer.on('request-finished', captureRequestData)
        const captureResponseData = data => thisRequestData.proxyServer.responses.push(data)
        proxyServer.on('response-finished', captureResponseData)

        Object.assign(thisRequestData, await sendRequestAndCaptureScriptData(page, request.url, request.requestOptions,
          request.expectNoResponseBody))

        // Remove per-request event listeners.
        page.off('console', captureConsoleMessage)
        proxyServer.off('request-finished', captureRequestData)
        proxyServer.off('response-finished', captureResponseData)

        logger.info('')
    }

    return requestData
}

async function sendRequestAndCaptureScriptData(page, url, requestOptions, expectNoResponseBody) {
    const responseScript = await page.evaluate((url, requestOptions = {}, expectNoResponseBody) => {
        return sendRequestAndCaptureDataScript(url, requestOptions, !expectNoResponseBody)
    }, url, requestOptions, expectNoResponseBody)
    return {
        requestSentByScript: responseScript.request,
        responseReceivedByScript: responseScript.response
    }
}

function saveResultsToFile(resultsPath, allRequestData) {
    logger.info(`Savings results to ${resultsPath}...`)
    const resultsDir = path.dirname(resultsPath)
    if(fs.existsSync(resultsDir)) fs.rmdirSync(resultsDir, { recursive: true })
    fs.mkdirSync(resultsDir)
    saveResultsAsHTML(allRequestData, resultsPath)
}

async function cleanup(browser, proxyServer) {
    await browser.close();
    shutdownProxyServer(proxyServer)
}