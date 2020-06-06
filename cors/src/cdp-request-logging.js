/*
    Regular Puppeteer seems to missing some request and response headers. This seems to because the standard CDP request
    and response events don't capture all these headers, and this seems to be what Puppeteer uses.

    There are additional extra info events you can listen to in CDP which provide extra header and other information.

    This file sets up capturing of all the events and stores the information against CDP request ID.
 */
const logger = require('./logging').createLogger('cdp-request-logging')

const CDP_EVT_REQUEST = 'Network.requestWillBeSent'
const CDP_EVT_REQUEST_EXTRA = 'Network.requestWillBeSentExtraInfo'
const CDP_EVT_RESPONSE = 'Network.responseReceived'
const CDP_EVT_RESPONSE_EXTRA = 'Network.responseReceivedExtraInfo'

/**
 * Sets up logging of all requests data.
 * Returns map of request ID to raw CDP request data. This will be populated as requests are made.
 */
exports.sendCapturingOfBrowserRequestData = async function(page) {
    const cdpSession = await page.target().createCDPSession()
    await cdpSession.send('Network.enable')
    const cdpRequestDataRaw = {}
    const addCDPRequestDataListener = (eventName) => {
        cdpSession.on(eventName, request => {
            logger.debug(`${eventName}: ${JSON.stringify(request, null, 2)}`)
            cdpRequestDataRaw[request.requestId] = cdpRequestDataRaw[request.requestId] || {}
            Object.assign(cdpRequestDataRaw[request.requestId], { [eventName]: request })
        })
    }
    addCDPRequestDataListener(CDP_EVT_REQUEST)
    addCDPRequestDataListener(CDP_EVT_REQUEST_EXTRA)
    addCDPRequestDataListener(CDP_EVT_RESPONSE)
    addCDPRequestDataListener(CDP_EVT_RESPONSE_EXTRA)
    return cdpRequestDataRaw
}

/**
 * Given the raw CDP request data captured by sendCapturingOfBrowserRequestData, will merge together the separate request
 * and response main and extra info. Only call this when all requests have completely finished.
 */
exports.mergeRawCDPRequestData = function(cdpRequestDataRaw) {
    const mergedCDPRequestDataMap = {}
    Object.entries(cdpRequestDataRaw).forEach(([requestID, rawCDPRequestData]) => {
        const singleMergedCDPRequestData = {}
        const mergeData = (mainEvtName, extraEvtName, key) => {
            if(rawCDPRequestData[mainEvtName]) {
                Object.assign(singleMergedCDPRequestData, { [key]: rawCDPRequestData[mainEvtName] })
            }
            if(rawCDPRequestData[extraEvtName]) {
                // Sometimes the extra info events are sent with a corresponding non extra info event. Handle that by
                // ensuring the nested object is always available. This can happen for example when a cross-origin
                // request is sent which does not respond with headers to allow it to process.
                if(!singleMergedCDPRequestData[key]) {
                    singleMergedCDPRequestData[key] = { [key]: {} }
                }
                Object.assign(singleMergedCDPRequestData[key][key], rawCDPRequestData[extraEvtName])
            }
        }

        // Request data.
        mergeData(CDP_EVT_REQUEST, CDP_EVT_REQUEST_EXTRA, 'request')
        mergeData(CDP_EVT_RESPONSE, CDP_EVT_RESPONSE_EXTRA, 'response')

        mergedCDPRequestDataMap[requestID] = singleMergedCDPRequestData
    })
    return mergedCDPRequestDataMap
}