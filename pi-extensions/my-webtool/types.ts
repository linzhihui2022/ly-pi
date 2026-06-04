import { TruncationResult } from "@earendil-works/pi-coding-agent";
import Type, { Static } from "typebox";

export const searchResponseSchema = Type.Array(
  Type.Object({
    title: Type.String(),
    url: Type.String(),
    snippet: Type.String(),
  })
);
export type SearchResults = Static<typeof searchResponseSchema>;

export interface SearchFailure {
  error: string;
  query: string;
  ok: false;
}
export interface SearchSuccess {
  query: string;
  results: SearchResult[];
  ok: true;
}
export type SearchResponse = SearchSuccess | SearchFailure;
export type SearchResult = SearchResults[number];

export interface FetchFailure {
  error: string;
  ok: false;
}
export interface FetchSuccess {
  response: {
    text: string;
    contentType: string;
  };
  ok: true;
}
export type FetchResponse = FetchSuccess | FetchFailure;

export interface FetchDetails {
  url: string;
  title?: string;
  contentType?: string;
  contentLength?: number;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export interface SearchProvider {
  readonly name: string;
  readonly label: string;
  check(): Promise<{ enabled: boolean; message: string }>;
  search(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<SearchResponse>;
}

export interface FetchProvider {
  readonly name: string;
  readonly label: string;
  check(): Promise<{ enabled: boolean; message: string }>;
  fetch(
    url: string,
    raw: boolean,
    signal?: AbortSignal
  ): Promise<FetchResponse>;
}
