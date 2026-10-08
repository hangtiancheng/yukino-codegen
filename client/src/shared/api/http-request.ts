export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequestOptions = {
  readonly method: HttpMethod;
  readonly url: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly suppressUnauthorizedRedirect?: boolean;
};

export type ResponseEnvelope = {
  readonly status: number;
  readonly url: string;
  readonly text: string;
};

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function buildUrl(baseUrl: string, options: HttpRequestOptions): string {
  const url = new URL(options.url, ensureTrailingSlash(baseUrl));
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function readResponse(
  response: Response,
): Promise<ResponseEnvelope> {
  return {
    status: response.status,
    url: response.url,
    text: await response.text(),
  };
}
