import type { Server } from "node:http";

export interface PreviewServer {
  port: number;
  url: string;
  server: Server;
}

export interface HtmlCopyConfig {
  enabled: boolean;
}
