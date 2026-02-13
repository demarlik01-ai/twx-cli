import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import type { XCredentials } from "../config.js";
import type { RequestMethod, XClientOptions } from "./types.js";

export type {
  RequestMethod,
  XPublicMetrics,
  XUserMetrics,
  XPost,
  XUser,
  XApiMeta,
  XApiResponse,
  XPaginatedResult,
  XClientOptions,
} from "./types.js";

const BASE_URL = "https://api.x.com/2";
const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1000;

// ─── Base Client ───

export class XClient {
  private oauth: OAuth;
  private token: { key: string; secret: string };
  private options: XClientOptions;

  constructor(credentials: XCredentials, options: XClientOptions = {}) {
    this.oauth = new OAuth({
      consumer: { key: credentials.apiKey, secret: credentials.apiSecret },
      signature_method: "HMAC-SHA1",
      hash_function(baseString, key) {
        return createHmac("sha1", key).update(baseString).digest("base64");
      },
    });
    this.token = { key: credentials.accessToken, secret: credentials.accessTokenSecret };
    this.options = options;
  }

  /** Safely parse JSON response, handling non-JSON bodies */
  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`X API error ${res.status}: ${text.slice(0, 200)}`);
      }
      return {} as T;
    }

    if (!res.ok) {
      const detail = (data as any)?.detail ?? (data as any)?.title ?? JSON.stringify(data);
      throw new Error(`X API error ${res.status}: ${detail}`);
    }

    return data as T;
  }

  /** Make an OAuth 1.0a signed request */
  public async request<T>(method: RequestMethod, url: string, body?: unknown, retryCount = 0): Promise<T> {
    const requestData = { url, method };
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));

    const headers: Record<string, string> = {
      ...authHeader,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && retryCount < MAX_RATE_LIMIT_RETRIES) {
      const waitMs = this.getRateLimitWaitMs(res.headers.get("x-rate-limit-reset"));
      const waitSeconds = (waitMs / 1000).toFixed(1);
      this.options.onRateLimit?.(
        `Rate limited by X API. Waiting ${waitSeconds}s before retry ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES}.`
      );
      await this.sleep(waitMs);
      return this.request<T>(method, url, body, retryCount + 1);
    }

    return this.parseResponse<T>(res);
  }

  private getRateLimitWaitMs(resetHeader: string | null): number {
    if (!resetHeader) {
      return DEFAULT_RATE_LIMIT_WAIT_MS;
    }
    const parsed = Number.parseInt(resetHeader, 10);
    if (Number.isNaN(parsed)) {
      return DEFAULT_RATE_LIMIT_WAIT_MS;
    }

    const nowMs = Date.now();
    const resetMs = parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
    return Math.max(resetMs - nowMs, 0);
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export { BASE_URL };
