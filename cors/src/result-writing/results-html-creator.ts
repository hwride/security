fs = require('fs');

module.exports = function createResultsHTML(requestsData, outputPath) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CORS</title>
    <style>
        :root {
            --error-color: #fc1b30;
        }
        html {
            font-family: sans-serif;
        }
        table, th, td {
            border-collapse: collapse;
            border: 1px solid black;
        }
        td {
            vertical-align: top;
            max-width: 50ch;
            overflow: auto;
        }
        td:first-child {
            white-space: nowrap;
        }
        .pre {
            white-space: pre;
        }
        .success {
            color: #0bc90b;
        }
        .error {
            color: var(--error-color);
        }
        .console-error {
            background: #fff0f0;
            color: var(--error-color);
            margin: 0;
            border-top: 1px solid #fed6d6;
            padding: 2px;
        }
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Notes</th>
                <th>Request seen by script</th>
                <th>Request sent to server</th>
                <th>Response sent by server</th>
                <th>Response seen by script</th>
                <th>Console</th>
            </tr>
        </thead>
`
    requestsData.forEach(requestData => {
        const {
            name,
            notes,
            requestSentByScript,
            responseReceivedByScript,
            consoleMessages,
        } = requestData

        const addTD = contents => html += `\t\t\t<td>${contents}</td>\n`
        html += '        <tr>\n'

        addTD(name)
        addTD(getNotesHTML(notes))
        addTD(getScriptRequestHTML(requestSentByScript))
        addTD(getServerRequestHTML(requestData))
        addTD(getServerResponseHTML(requestData))
        addTD(getScriptResponseHTML(responseReceivedByScript))
        addTD(getConsoleHTML(consoleMessages))

        html += '        </tr>\n'
    })

    html += `    </table>
</body>
</html>`

    fs.writeFileSync(outputPath, html)
}

function getScriptRequestHTML(requestSentByScript) {
    return getScriptObjectHTML(requestSentByScript)
}

function getServerRequestHTML(requestData) {
    // Combining all proxy requests here for the sake of completeness, but would expect only requests from a
    // single proxy server.
    const proxyRequests = requestData.proxyServer.requests
    if(proxyRequests.length === 0) return 'None'
    else {
        let html = ''
        proxyRequests.forEach(proxyRequest => html += getServerRequestHTMLSingle(proxyRequest) + '\n')
        return html
    }

    function getServerRequestHTMLSingle(proxyRequest) {
        let html = `<code class="pre">${proxyRequest.req.method} ${proxyRequest.req.url}\n`
        html += convertRawHeadersToHTML(proxyRequest.req.rawHeaders)
        html += `${proxyRequest.body}`
        html += `<code>`
        return html
    }
}

function getServerResponseHTML(requestData) {
    // Combining all proxy responses here for the sake of completeness, but would expect only responses from a
    // single proxy server.
    const proxyResponses = requestData.proxyServer.responses
    if(proxyResponses.length === 0) return 'None'
    else {
        let html = ''
        proxyResponses.forEach(proxyResponse => html += getServerResponseHTMLSingle(proxyResponse) + '<br/>')
        return html
    }

    function getServerResponseHTMLSingle(response) {
        let responseStr = ''

        // Status.
        const status = response.res.statusCode
        let statusLine = `${status} ${response.res.statusMessage}`
        let statusClass = status != null && (status >= 200 && status < 400) ? 'success' : 'error'
        statusLine = `<span class="${statusClass}">${statusLine}</span>\n`
        responseStr += statusLine

        // Headers.
        const headersCapitalised = {}
        Object.entries(response.res.getHeaders()).forEach(([ key, val ]) => {
            const capitalisedKey = key.split('-').map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('-')
            headersCapitalised[capitalisedKey] = val
        })
        responseStr += convertHeadersObjectToHTML(headersCapitalised)

        // Body.
        responseStr += response.body != null ? response.body : `<span class="error">[No body]</span>`

        return `<code class="pre">${responseStr}</code>`
    }
}

function getScriptResponseHTML(responseReceivedByScript) {
    if(responseReceivedByScript == null) {
        return 'None'
    } else if(responseReceivedByScript.error != null) {
        return `<code class="pre console-error">${responseReceivedByScript.error}</code>`
    } else {
        return getScriptObjectHTML(responseReceivedByScript)
    }
}

function getConsoleHTML(consoleMessages) {
    let consoleMessagesStr = ''
    consoleMessages.forEach(msg => {
        let logLevel
        if(msg.type() === 'error') {
            logLevel = 'ERROR'
        } else {
            logLevel = 'INFO'
        }
        //
        consoleMessagesStr += `<p`
        if(logLevel === 'ERROR') consoleMessagesStr += ' class="console-error"'
        consoleMessagesStr += `>[${logLevel}] ${msg.text()}</p>`
    })
    return `<code>${consoleMessagesStr}</code>`
}

function getNotesHTML(notes) {
    return notes != null ? notes : ''
}

function getScriptObjectHTML(object) {
    if(object == null) {
        return 'None'
    } else if(object.error) {
        return `<code><p class="console-error">[ERROR] ${object.msg}</p></code>`
    } else {
        let html = `<code class="pre">`
        Object.entries(object).forEach(([key, value]) => {
            html += `${key}: ${JSON.stringify(value, null, 2)}\n`
        })
        html += `</code>`
        return html
    }
}

function convertRawHeadersToHTML(rawHeaders) {
    // Convert raw headers to object.
    const headers = {}
    let key
    for (const rawHeader of rawHeaders) {
        if (!key) {
            key = rawHeader
        } else {
            headers[key] = rawHeader
            key = null
        }
    }

    return convertHeadersObjectToHTML(headers)
}

function convertHeadersObjectToHTML(headersObject) {
    // Convert headers object to HTML.
    let headersStr = ''
    if(headersObject) {
        Object.entries(headersObject).forEach(([name, value]) => {
            headersStr += `${name}: ${value}\n`
        })
    }
    return headersStr
}