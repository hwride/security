const runCorsTests = require('puppeteer');

(async () => {
    // Setup browser.
    const browser = await runCorsTests.launch();
    
    // Setup page.
    const page = await browser.newPage();
    setupLogging(page)
    await page.goto('http://localhost:8080/');
    await setupPageUtilFunctions(page)

    // Make a test request.
    const request = await sendRequestAndCaptureData(page, 'http://localhost:8080/regular-endpoint')
    console.log(request)

    // Tear down browser.
    await browser.close();
})();

async function setupPageUtilFunctions(page) {
    await page.evaluate(async () => {
        window.sendRequestAndCaptureData = async function(url, requestOptions, readBody = true) {
            const request = new Request(url, requestOptions)
            const response = await fetch(request)
            const data = {
                request: {
                    mode: request.mode,
                    credentials: request.credentials
                },
                response: {
                    type: response.type,
                    bodyNonNull: response.body != null
                }
            }
            if(readBody) {
                data.response.body = JSON.stringify(await response.json())
            }
            return data
        }
    })
}

async function sendRequestAndCaptureData(page, url) {
    const waitForResponsePromise = page.waitForResponse(url)
    const responseScript = await page.evaluate(async url => sendRequestAndCaptureData(url), url)
    const responseBrowser = await waitForResponsePromise
    const request = responseBrowser.request()
    return {
        name: 'Regular endpoint same origin',
        requestSentByScript: responseScript.request,
        requestSentByBrowser: {
            methodAndURL: `${request.method()} ${request.url()}`,
            originHeader: request.headers().origin,
        },
        responseReceivedByBrowser: {
            status: `${responseBrowser.status()} ${responseBrowser.statusText()}`,
            responseBody: await responseBrowser.text()
        },
        responseReceivedByScript: responseScript.response
    }
}

/*
Ideal data:
name
request data from script
request data from browser
whether server processes request
response data to browser
response data to script
 */

function setupLogging(page) {
    page.on('console', msg => console.log('[Page] ', msg.text()));
    page.on('request', request => logRequest(request))
    page.on('response', response => logResponse(response))
}

function logRequest(request) {
    let out = `${request.method()} ${request.url()}\n`
    Object.keys(request.headers()).forEach(key => {
        out += `${key}: ${request.headers()[key]}\n`
    })
    console.log(out)
}

function logResponse(response) {
    let out = `${response.status()} ${response.statusText()}\n`
    Object.keys(response.headers()).forEach(key => {
        out += `${key}: ${response.headers()[key]}\n`
    })
    console.log(out)
}