import type {
  ClientRequest,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import type { LogLevelDesc } from "loglevel";
import type { Express } from "express";
import type { LaunchOptions } from "puppeteer";

export interface CorsConfig {
  resultsPath: string;
  ports: {
    server1: number;
    server2: number;
    proxy: number;
  };
  puppeteer: LaunchOptions;
  log: Record<string, LogLevelDesc>;
}

export interface TestDefinition {
  name: string;
  notes?: string;
  url: string;
  requestOptions?: RequestInit;
  expectNoResponseBody?: boolean;
  expectBlockedRequest?: boolean;
}

export interface ConsoleMessageData {
  type: string;
  text: string;
}

export interface ScriptErrorData {
  error: true;
  msg: string;
}

export interface ScriptRequestData {
  method: string;
  url: string;
  mode: string;
  credentials: string;
  headers: string;
}

export interface ScriptResponseData {
  type: string;
  headers: string;
  status: number;
  statusText: string;
  body?: string;
}

export type ScriptRequestResult = ScriptRequestData | ScriptErrorData;
export type ScriptResponseResult = ScriptResponseData | ScriptErrorData | null;

export interface ProxyServerRequestData {
  proxyReq: ClientRequest;
  req: IncomingMessage;
  body: string;
}

export interface ProxyServerResponseData {
  proxyRes: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
  body: string;
}

export interface TestResultData {
  name: string;
  notes?: string;
  expectNoResponseBody?: boolean;
  consoleMessages: ConsoleMessageData[];
  proxyServer: {
    requests: ProxyServerRequestData[];
    responses: ProxyServerResponseData[];
  };
  requestSentByScript: ScriptRequestResult;
  responseReceivedByScript: ScriptResponseResult;
}

export type ProxyRequestFinishedListener = (
  data: ProxyServerRequestData,
) => void;
export type ProxyResponseFinishedListener = (
  data: ProxyServerResponseData,
) => void;

export interface ProxyServer {
  nodeHTTPProxy: ReturnType<typeof import("http-proxy").createProxyServer>;
  httpServer: Server;
  on(
    eventName: "request-finished",
    listener: ProxyRequestFinishedListener,
  ): void;
  on(
    eventName: "response-finished",
    listener: ProxyResponseFinishedListener,
  ): void;
  off(
    eventName: "request-finished",
    listener: ProxyRequestFinishedListener,
  ): void;
  off(
    eventName: "response-finished",
    listener: ProxyResponseFinishedListener,
  ): void;
}

export interface RunningServer {
  app: Express;
  httpServer: Server;
}

export interface MainServers {
  server1: RunningServer;
  server2: RunningServer;
}
