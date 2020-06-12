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
                <th>Request sent by browser</th>
                <th>Response received by browser</th>
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
            requestSentByBrowser,
            responseReceivedByBrowser,
            responseReceivedByScript,
            consoleMessages,
        } = requestData

        const addTD = contents => html += `\t\t\t<td>${contents}</td>\n`
        html += '        <tr>\n'

        addTD(name)
        addTD(getNotesHTML(notes))
        addTD(getScriptRequestHTML(requestSentByScript))
        addTD(getBrowserRequestHTML(requestSentByBrowser))
        addTD(getBrowserResponseHTML(responseReceivedByBrowser))
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

function getBrowserRequestHTML(requestSentByBrowser) {
    let html = `${requestSentByBrowser.request.method} ${requestSentByBrowser.request.url}`
    html += getHeaderStr(requestSentByBrowser.request.headers, /Accept$/)
    html += getHeaderStr(requestSentByBrowser.request.headers, /Host/)
    html += getHeaderStr(requestSentByBrowser.request.headers, /Referer/)
    html += getHeaderStr(requestSentByBrowser.request.headers, /Origin/)
    return getCodePre(html)
}

function getBrowserResponseHTML(responseReceivedByBrowser) {
    let responseStr = ''

    // Status.
    let statusLine =
        `${emptyCheck(responseReceivedByBrowser.response, 'status')} ` +
        `${emptyCheck(responseReceivedByBrowser.response, 'statusText')}`
    const status = responseReceivedByBrowser.response.status
    let statusClass = status != null && (status >= 200 && status < 300) ? 'success' : 'error'
    statusLine = `<span class="${statusClass}">${statusLine}</span>`
    responseStr += statusLine

    // Headers.
    responseStr += getHeaderStr(responseReceivedByBrowser.response.headers, /Content-Type/)
    responseStr += getHeaderStr(responseReceivedByBrowser.response.headers, /Access-Control.*/)

    // Body.
    responseStr += '\n' + (responseReceivedByBrowser.response.body != null ?
        responseReceivedByBrowser.response.body :
        `<span class="error">[No body]</span>`)

    return `<code class="pre">${responseStr}</code>`
}

function getScriptResponseHTML(responseReceivedByScript) {
    if(responseReceivedByScript.error != null) {
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
    let html = `<code class="pre">`
    Object.entries(object).forEach(([key, value]) => {
        html += `${key}: ${JSON.stringify(value, null, 2)}\n`
    })
    html += `</code>`
    return html
}

function getHeaderStr(headers, regex) {
    let headersStr = ''
    if(headers) {
        Object.entries(headers).forEach(([name, value]) => {
            if (name.match(regex)) {
                headersStr += `\n${name}: ${value}`
            }
        })
    }
    return headersStr
}

function getCodePre(html) {
    return `<code class="pre">${html}</code>`
}

function emptyCheck(obj, key) {
    return obj[key] != null ? obj[key] : `[No ${key}]`
}