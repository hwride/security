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

  for (const requestData of requestsData) {
    html += "        <tr>\n";
    html += createTableCell(requestData.name);
    html += createTableCell(getNotesHTML(requestData.notes));
    html += createTableCell(
      getScriptRequestHTML(requestData.requestSentByScript),
    );
    html += createTableCell(getServerRequestHTML(requestData));
    html += createTableCell(getServerResponseHTML(requestData));
    html += createTableCell(
      getScriptResponseHTML(requestData.responseReceivedByScript),
    );
    html += createTableCell(getConsoleHTML(requestData.consoleMessages));
    html += "        </tr>\n";
  }

  html += `    </table>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}

function createTableCell(contents: string): string {
  return `\t\t\t<td>${contents}</td>\n`;
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
  }

  return proxyRequests
    .map((proxyRequest) => getServerRequestHTMLSingle(proxyRequest))
    .join("\n");
}

function getServerRequestHTMLSingle(
  proxyRequest: ProxyServerRequestData,
): string {
  let html = `<code class="pre">${proxyRequest.req.method ?? "UNKNOWN"} ${proxyRequest.req.url ?? ""}\n`;
  html += convertRawHeadersToHTML(proxyRequest.req.rawHeaders);
  html += proxyRequest.body;
  html += "</code>";
  return html;
}

function getServerResponseHTML(requestData: TestResultData): string {
  // Combining all proxy responses here for the sake of completeness, but would expect only responses from a
  // single proxy server.
  const proxyResponses = requestData.proxyServer.responses;
  if (proxyResponses.length === 0) {
    return "None";
  }

  return proxyResponses
    .map((proxyResponse) => getServerResponseHTMLSingle(proxyResponse))
    .join("<br/>");
}

function getServerResponseHTMLSingle(
  response: ProxyServerResponseData,
): string {
  let responseStr = "";

  // Status.
  const status = response.res.statusCode;
  const isSuccess = status != null && status >= 200 && status < 400;
  const statusClass = isSuccess ? "success" : "error";
  const statusLine =
    `${status ?? "Unknown"} ${response.res.statusMessage ?? ""}`.trim();
  responseStr += `<span class="${statusClass}">${statusLine}</span>\n`;

  // Headers.
  const headersCapitalised: Record<string, string | number | string[]> = {};
  Object.entries(response.res.getHeaders()).forEach(([key, value]) => {
    const capitalisedKey = key
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
    headersCapitalised[capitalisedKey] = normaliseHeaderValue(value);
  });
  responseStr += convertHeadersObjectToHTML(headersCapitalised);

  // Body.
  if (response.body != null) {
    responseStr += response.body;
  } else {
    responseStr += '<span class="error">[No body]</span>';
  }

  return `<code class="pre">${responseStr}</code>`;
}

function normaliseHeaderValue(
  value: number | string | string[] | undefined,
): string | number | string[] {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value;
}

function getScriptResponseHTML(
  responseReceivedByScript: ScriptResponseResult,
): string {
  if (responseReceivedByScript == null) {
    return "None";
  }

  if (isScriptError(responseReceivedByScript)) {
    return `<code class="pre console-error">${responseReceivedByScript.msg}</code>`;
  }

  return getScriptObjectHTML(responseReceivedByScript);
}

function getConsoleHTML(consoleMessages: ConsoleMessageData[]): string {
  const consoleMessagesStr = consoleMessages
    .map((msg) => {
      const logLevel = msg.type === "error" ? "ERROR" : "INFO";
      const className = logLevel === "ERROR" ? ' class="console-error"' : "";
      //
      return `<p${className}>[${logLevel}] ${msg.text}</p>`;
    })
    .join("");

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
  let key: string | undefined;

  for (const rawHeader of rawHeaders) {
    if (key == null) {
      key = rawHeader;
      continue;
    }

    headers[key] = rawHeader;
    key = undefined;
  }

  return convertHeadersObjectToHTML(headers);
}

function convertHeadersObjectToHTML(
  headersObject: Record<string, string | number | string[]>,
): string {
  // Convert headers object to HTML.
  let headersStr = "";

  Object.entries(headersObject).forEach(([name, value]) => {
    headersStr += `${name}: ${value}\n`;
  });

  return headersStr;
}
