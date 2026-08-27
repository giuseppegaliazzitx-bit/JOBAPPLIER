import type { AppConfig } from "@autoapply/core";

export type FetchPageResult = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  body: string;
  contentType: string;
};

export type FetchPage = (url: string) => Promise<FetchPageResult>;

export function createFetchPage(config: AppConfig): FetchPage {
  return async (url: string): Promise<FetchPageResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": config.fetchUserAgent,
        },
      });
      const contentType = response.headers.get("content-type") ?? "";
      const isHtml = contentType.includes("html") || contentType.includes("xml") || contentType.length === 0;
      const body = isHtml ? await response.text() : "";
      return {
        requestedUrl: url,
        finalUrl: response.url || url,
        status: response.status,
        body,
        contentType,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
