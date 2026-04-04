import * as fs from "node:fs";
import * as path from "node:path";

import puppeteer, {
  type Browser,
  type ConsoleMessage,
  type LaunchOptions,
  type Page,
} from "puppeteer";

import { createLogger } from "../framework/logging.ts";
import { createResultsHTML } from "../result-writing/results-html-creator.ts";
import {
  setupProxyServer,
  shutdownProxyServer,
} from "../servers/servers-proxy.ts";
import type {
  ConsoleMessageData,
  ProxyRequestFinishedListener,
  ProxyResponseFinishedListener,
  ProxyServer,
  ScriptErrorData,
  ScriptRequestResult,
  ScriptResponseData,
  ScriptResponseResult,
  TestDefinition,
  TestResultData,
} from "../types.ts";

const logger = createLogger("run-cors-tests");

interface TestRequestsConfig {
  proxyPort: number;
  mainPageURL: string;
  testDefinitions: TestDefinition[];
  resultsPath?: string;
  puppeteerConfig?: LaunchOptions;
}

interface BrowserCaptureData {
  request: ScriptRequestResult;
  response: ScriptResponseResult;
}

interface PageSetup {
  browser: Browser;
  page: Page;
}

/**
 * Makes test requests from Chromium dev tools, captures data about the requests, and optionally writes it to HTML for display.
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
export async function testRequests({
  proxyPort,
  mainPageURL,
  testDefinitions,
  resultsPath,
  puppeteerConfig,
}: TestRequestsConfig): Promise<TestResultData[]> {
  // Setup.
  const proxyServer = setupProxyServer(proxyPort);
  let browser: Browser | undefined;

  try {
    const pageSetup = await setupPage(puppeteerConfig, proxyPort, mainPageURL);
    browser = pageSetup.browser;

    // Make requests.
    const allRequestData = await makeRequests(
      pageSetup.page,
      proxyServer,
      testDefinitions,
    );

    // Save results to file.
    if (resultsPath) {
      saveResultsToFile(resultsPath, allRequestData);
    }

    return allRequestData;
  } finally {
    // Teardown.
    await cleanup(browser, proxyServer);
  }
}

async function setupPage(
  puppeteerConfig: LaunchOptions | undefined,
  proxyPort: number,
  mainPageURL: string,
): Promise<PageSetup> {
  const browser = await puppeteer.launch({
    ...puppeteerConfig,
    args: [
      ...(puppeteerConfig?.args ?? []),
      `--proxy-server=localhost:${proxyPort}`,
      // Need the following line to get it to work, see: https://github.com/puppeteer/puppeteer/issues/3711#issuecomment-451007780
      "--proxy-bypass-list=<-loopback>",
    ],
  });
  const page = await browser.newPage();

  page.on("console", (msg: ConsoleMessage) =>
    logger.info(`[Page] ${msg.text()}`),
  );

  await page.goto(mainPageURL);
  await setupBrowserRequestCapturingFunction(page);

  return { browser, page };
}

/**
 * Sets up a global function on the page which will send a request and capture its request data.
 */
async function setupBrowserRequestCapturingFunction(page: Page): Promise<void> {
  await page.evaluate(async () => {
    type CaptureFunction = (
      url: string,
      requestOptions?: RequestInit,
      readBody?: boolean,
    ) => Promise<BrowserCaptureData>;

    const windowWithCapture = window as Window &
      typeof globalThis & {
        sendRequestAndCaptureDataScript: CaptureFunction;
      };

    windowWithCapture.sendRequestAndCaptureDataScript = async (
      url,
      requestOptions = {},
      readBody = true,
    ) => {
      // Code below to handle errors possibly occurring in request or response.
      let request: Request | Error;
      let response: Response | Error | undefined;

      try {
        request = new Request(url, requestOptions);
      } catch (error) {
        request = error as Error;
      }

      try {
        if (!(request instanceof Error)) {
          response = await fetch(request);
        }
      } catch (error) {
        response = error as Error;
      }

      const getErrorObj = (error: Error): ScriptErrorData => ({
        error: true,
        msg: `${error.name}: ${error.message}`,
      });

      const data: BrowserCaptureData = {
        request:
          request instanceof Error
            ? getErrorObj(request)
            : {
                method: request.method,
                url: request.url,
                mode: request.mode,
                credentials: request.credentials,
                headers: JSON.stringify(
                  Object.fromEntries(request.headers.entries()),
                  null,
                  2,
                ),
              },
        response: null,
      };

      if (response instanceof Error) {
        data.response = getErrorObj(response);
        return data;
      }

      if (response) {
        const responseData: ScriptResponseData = {
          type: response.type,
          headers: JSON.stringify(
            Object.fromEntries(response.headers.entries()),
            null,
            2,
          ),
          status: response.status,
          statusText: response.statusText,
        };

        if (readBody) {
          responseData.body = await response.text();
        }

        data.response = responseData;
      }

      return data;
    };
  });
}

/**
 * Make some requests logging data about those requests.
 * @param page Page object. We will trigger requests and capture script request data from here.
 * @param proxyServer Proxy server requests are made via, we will capture server request data from here.
 * @param requestsToMake Array of requests to make.
 * @returns {Promise<[]>}
 */
async function makeRequests(
  page: Page,
  proxyServer: ProxyServer,
  requestsToMake: TestDefinition[],
): Promise<TestResultData[]> {
  const requestData: TestResultData[] = [];

  // Ensure requests happen one at a time so all event capturing we are doing lines up correctly.
  for (const request of requestsToMake) {
    const requestMsg = `Processing request: ${request.name}`;
    logger.info("-".repeat(requestMsg.length));
    logger.info(requestMsg);
    logger.info("-".repeat(requestMsg.length));

    const thisRequestData: TestResultData = {
      name: request.name,
      notes: request.notes,
      expectNoResponseBody: request.expectNoResponseBody,
      consoleMessages: [],
      proxyServer: { requests: [], responses: [] },
      requestSentByScript: { error: true, msg: "Request was not executed." },
      responseReceivedByScript: null,
    };
    requestData.push(thisRequestData);

    // Capture console data for this request.
    const captureConsoleMessage = (msg: ConsoleMessage): void => {
      thisRequestData.consoleMessages.push(serializeConsoleMessage(msg));
    };
    page.on("console", captureConsoleMessage);

    // Capture server request data via the proxies for this request.
    const captureRequestData: ProxyRequestFinishedListener = (data) => {
      thisRequestData.proxyServer.requests.push(data);
    };
    proxyServer.on("request-finished", captureRequestData);

    const captureResponseData: ProxyResponseFinishedListener = (data) => {
      thisRequestData.proxyServer.responses.push(data);
    };
    proxyServer.on("response-finished", captureResponseData);

    const scriptData = await sendRequestAndCaptureScriptData(
      page,
      request.url,
      request.requestOptions,
      request.expectNoResponseBody === true,
    );
    thisRequestData.requestSentByScript = scriptData.requestSentByScript;
    thisRequestData.responseReceivedByScript =
      scriptData.responseReceivedByScript;

    // Remove per-request event listeners.
    page.off("console", captureConsoleMessage);
    proxyServer.off("request-finished", captureRequestData);
    proxyServer.off("response-finished", captureResponseData);

    logger.info("");
  }

  return requestData;
}

function serializeConsoleMessage(msg: ConsoleMessage): ConsoleMessageData {
  return {
    type: msg.type(),
    text: msg.text(),
  };
}

async function sendRequestAndCaptureScriptData(
  page: Page,
  url: string,
  requestOptions: RequestInit | undefined,
  expectNoResponseBody: boolean,
): Promise<{
  requestSentByScript: ScriptRequestResult;
  responseReceivedByScript: ScriptResponseResult;
}> {
  const responseScript = await page.evaluate(
    (requestURL, requestInit = {}, skipResponseBody) => {
      type CaptureFunction = (
        url: string,
        requestOptions?: RequestInit,
        readBody?: boolean,
      ) => Promise<BrowserCaptureData>;

      const windowWithCapture = window as Window &
        typeof globalThis & {
          sendRequestAndCaptureDataScript: CaptureFunction;
        };

      return windowWithCapture.sendRequestAndCaptureDataScript(
        requestURL,
        requestInit,
        !skipResponseBody,
      );
    },
    url,
    requestOptions ?? {},
    expectNoResponseBody,
  );

  return {
    requestSentByScript: responseScript.request,
    responseReceivedByScript: responseScript.response,
  };
}

function saveResultsToFile(
  resultsPath: string,
  allRequestData: TestResultData[],
): void {
  logger.info(`Saving results to ${resultsPath}...`);

  const resultsDir = path.dirname(resultsPath);
  fs.rmSync(resultsDir, { recursive: true, force: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  createResultsHTML(allRequestData, resultsPath);
}

async function cleanup(
  browser: Browser | undefined,
  proxyServer: ProxyServer,
): Promise<void> {
  try {
    if (browser) {
      await browser.close();
    }
  } finally {
    shutdownProxyServer(proxyServer);
  }
}
