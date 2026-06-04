export interface WebToolConfig {
  defaultSearchProvider?: string;
  defaultFetchProvider?: string;
  maxResults?: number;
  timeout?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export function loadConfig(): WebToolConfig {
  return {};
}
