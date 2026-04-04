import * as fs from "node:fs";

import type {
  ConsoleMessageData,
  ProxyServerRequestData,
  ProxyServerResponseData,
  ScriptErrorData,
  ScriptRequestResult,
  ScriptResponseResult,
  TestResultData,
} from "../types.ts";

export function createResultsHTML(
  requestsData: TestResultData[],
  outputPath: string,
): void {
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
`;

  requestsData.forEach((requestData) => {
    const {
      name,
      notes,
      requestSentByScript,
      responseReceivedByScript,
      consoleMessages,
    } = requestData;

    const addTD = (contents: string): void => {
      html += `\t\t\t<td>${contents}</td>\n`;
    };
    html += "        <tr>\n";

    addTD(name);
    addTD(getNotesHTML(notes));
    addTD(getScriptRequestHTML(requestSentByScript));
    addTD(getServerRequestHTML(requestData));
    addTD(getServerResponseHTML(requestData));
    addTD(getScriptResponseHTML(responseReceivedByScript));
    addTD(getConsoleHTML(consoleMessages));

    html += "        </tr>\n";
  });

  html += `    </table>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}

function getNotesHTML(notes: string | undefined): string {
  return notes ?? "";
}

function getScriptRequestHTML(
  requestSentByScript: ScriptRequestResult,
): string {
  return getScriptObjectHTML(requestSentByScript);
}

function getServerRequestHTML(requestData: TestResultData): string {
  // Combining all proxy requests here for the sake of completeness, but would expect only requests from a
  // single proxy server.
  const proxyRequests = requestData.proxyServer.requests;
  if (proxyRequests.length === 0) {
    return "None";
  } else {
    let html = "";
    proxyRequests.forEach((proxyRequest) => {
      html += getServerRequestHTMLSingle(proxyRequest) + "\n";
    });
    return html;
  }

  function getServerRequestHTMLSingle(
    proxyRequest: ProxyServerRequestData,
  ): string {
    let html = `<code class="pre">${proxyRequest.req.method ?? "UNKNOWN"} ${proxyRequest.req.url ?? ""}\n`;
    html += convertRawHeadersToHTML(proxyRequest.req.rawHeaders);
    html += `${proxyRequest.body}`;
    html += `</code>`;
    return html;
  }
}

function getServerResponseHTML(requestData: TestResultData): string {
  // Combining all proxy responses here for the sake of completeness, but would expect only responses from a
  // single proxy server.
  const proxyResponses = requestData.proxyServer.responses;
  if (proxyResponses.length === 0) {
    return "None";
  } else {
    let html = "";
    proxyResponses.forEach((proxyResponse) => {
      html += getServerResponseHTMLSingle(proxyResponse) + "<br/>";
    });
    return html;
  }

  function getServerResponseHTMLSingle(
    response: ProxyServerResponseData,
  ): string {
    let responseStr = "";

    // Status.
    const status = response.res.statusCode;
    let statusLine = `${status} ${response.res.statusMessage}`;
    const statusClass =
      status != null && status >= 200 && status < 400 ? "success" : "error";
    statusLine = `<span class="${statusClass}">${statusLine}</span>\n`;
    responseStr += statusLine;

    // Headers.
    const headersCapitalised: Record<string, string | number | string[]> = {};
    Object.entries(response.res.getHeaders()).forEach(([key, value]) => {
      const capitalisedKey = key
        .split("-")
        .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
        .join("-");
      headersCapitalised[capitalisedKey] = value ?? "";
    });
    responseStr += convertHeadersObjectToHTML(headersCapitalised);

    // Body.
    responseStr +=
      response.body != null
        ? response.body
        : `<span class="error">[No body]</span>`;

    return `<code class="pre">${responseStr}</code>`;
  }
}

function getScriptResponseHTML(
  responseReceivedByScript: ScriptResponseResult,
): string {
  if (responseReceivedByScript == null) {
    return "None";
  } else if (isScriptError(responseReceivedByScript)) {
    return `<code class="pre console-error">${responseReceivedByScript.msg}</code>`;
  } else {
    return getScriptObjectHTML(responseReceivedByScript);
  }
}

function getConsoleHTML(consoleMessages: ConsoleMessageData[]): string {
  let consoleMessagesStr = "";
  consoleMessages.forEach((msg) => {
    let logLevel;
    if (msg.type === "error") {
      logLevel = "ERROR";
    } else {
      logLevel = "INFO";
    }
    //
    consoleMessagesStr += `<p`;
    if (logLevel === "ERROR") {
      consoleMessagesStr += ` class="console-error"`;
    }
    consoleMessagesStr += `>[${logLevel}] ${msg.text}</p>`;
  });

  return `<code>${consoleMessagesStr}</code>`;
}

function getScriptObjectHTML(
  object: ScriptRequestResult | ScriptResponseResult,
): string {
  if (object == null) {
    return "None";
  }

  if (isScriptError(object)) {
    return `<code><p class="console-error">[ERROR] ${object.msg}</p></code>`;
  }

  let html = '<code class="pre">';
  Object.entries(object).forEach(([key, value]) => {
    html += `${key}: ${JSON.stringify(value, null, 2)}\n`;
  });
  html += "</code>";
  return html;
}

function isScriptError(
  object: ScriptRequestResult | ScriptResponseResult,
): object is ScriptErrorData {
  return object != null && "error" in object && object.error === true;
}

function convertRawHeadersToHTML(rawHeaders: readonly string[]): string {
  // Convert raw headers to object.
  const headers: Record<string, string> = {};
  let key;
  for (const rawHeader of rawHeaders) {
    if (!key) {
      key = rawHeader;
    } else {
      headers[key] = rawHeader;
      key = null;
    }
  }

  return convertHeadersObjectToHTML(headers);
}

function convertHeadersObjectToHTML(
  headersObject: Record<string, string | number | string[]>,
): string {
  // Convert headers object to HTML.
  let headersStr = "";
  if (headersObject) {
    Object.entries(headersObject).forEach(([name, value]) => {
      headersStr += `${name}: ${value}\n`;
    });
  }

  return headersStr;
}
