import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import type { XCredentials } from "./config.js";

const BASE_URL = "https://api.x.com/2";
const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1000;

type RequestMethod = "GET" | "POST" | "DELETE";

export interface XPublicMetrics {
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count?: number;
}

export interface XUserMetrics {
  followers_count: number;
  following_count: number;
  tweet_count: number;
  listed_count?: number;
}

export interface XPost {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: XPublicMetrics;
}

export interface XUser {
  id: string;
  name: string;
  username: string;
  description?: string;
  public_metrics?: XUserMetrics;
}

export interface XApiMeta {
  next_token?: string;
  result_count?: number;
  [key: string]: unknown;
}

interface XApiResponse<T> {
  data?: T;
  meta?: XApiMeta;
}

export interface XPaginatedResult<T> {
  data: T[];
  nextToken?: string;
  meta?: XApiMeta;
}

export interface XClientOptions {
  onRateLimit?: (message: string) => void;
}

export class XClient {
  private oauth: OAuth;
  private token: { key: string; secret: string };
  private bearerToken?: string;
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
    this.bearerToken = credentials.bearerToken;
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
  private async request<T>(method: RequestMethod, url: string, body?: unknown, retryCount = 0): Promise<T> {
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

  // ─── Posts ───

  /** Create a new post (tweet) */
  async createPost(text: string, options?: {
    replyTo?: string;
    quoteTweetId?: string;
  }): Promise<{ id: string; text: string }> {
    const body: Record<string, unknown> = { text };
    if (options?.replyTo) {
      body.reply = { in_reply_to_tweet_id: options.replyTo };
    }
    if (options?.quoteTweetId) {
      body.quote_tweet_id = options.quoteTweetId;
    }
    const res = await this.request<XApiResponse<XPost>>("POST", `${BASE_URL}/tweets`, body);
    if (!res.data) {
      throw new Error("X API returned no post data.");
    }
    return res.data;
  }

  /** Delete a post */
  async deletePost(id: string): Promise<boolean> {
    const res = await this.request<XApiResponse<{ deleted?: boolean }>>("DELETE", `${BASE_URL}/tweets/${id}`);
    return Boolean(res.data?.deleted);
  }

  // ─── Users ───

  /** Get authenticated user's info */
  async me(): Promise<XUser> {
    const res = await this.request<XApiResponse<XUser>>(
      "GET",
      `${BASE_URL}/users/me?user.fields=id,name,username,description,public_metrics`
    );
    if (!res.data) {
      throw new Error("X API returned no authenticated user data.");
    }
    return res.data;
  }

  /** Get user by username */
  async getUser(username: string): Promise<XUser> {
    const res = await this.request<XApiResponse<XUser>>(
      "GET",
      `${BASE_URL}/users/by/username/${username}?user.fields=id,name,username,description,public_metrics`
    );
    if (!res.data) {
      throw new Error(`X API returned no user data for @${username}.`);
    }
    return res.data;
  }

  // ─── Timeline ───

  /** Get user's recent posts (max_results: 5-100) */
  async getUserPosts(userId: string, maxResults = 10, paginationToken?: string): Promise<XPaginatedResult<XPost>> {
    const clamped = Math.max(5, Math.min(100, maxResults));
    const params = new URLSearchParams({
      max_results: String(clamped),
      "tweet.fields": "created_at,public_metrics,text",
    });
    if (paginationToken) {
      params.set("pagination_token", paginationToken);
    }
    const res = await this.request<XApiResponse<XPost[]>>(
      "GET",
      `${BASE_URL}/users/${userId}/tweets?${params.toString()}`
    );
    return {
      data: Array.isArray(res.data) ? res.data : [],
      nextToken: res.meta?.next_token,
      meta: res.meta,
    };
  }

  // ─── Search ───

  /** Search recent posts (max_results: 10-100) */
  async searchRecent(query: string, maxResults = 10, paginationToken?: string): Promise<XPaginatedResult<XPost>> {
    const clamped = Math.max(10, Math.min(100, maxResults));
    const params = new URLSearchParams({
      query,
      max_results: String(clamped),
      "tweet.fields": "created_at,public_metrics,author_id,text",
    });
    if (paginationToken) {
      params.set("next_token", paginationToken);
    }
    const res = await this.request<XApiResponse<XPost[]>>(
      "GET",
      `${BASE_URL}/tweets/search/recent?${params.toString()}`
    );
    return {
      data: Array.isArray(res.data) ? res.data : [],
      nextToken: res.meta?.next_token,
      meta: res.meta,
    };
  }

  // ─── Likes ───

  /** Like a post */
  async like(userId: string, tweetId: string): Promise<boolean> {
    const res = await this.request<XApiResponse<{ liked?: boolean }>>("POST", `${BASE_URL}/users/${userId}/likes`, {
      tweet_id: tweetId,
    });
    return Boolean(res.data?.liked);
  }

  /** Unlike a post */
  async unlike(userId: string, tweetId: string): Promise<boolean> {
    const res = await this.request<XApiResponse<{ liked?: boolean }>>("DELETE", `${BASE_URL}/users/${userId}/likes/${tweetId}`);
    return !Boolean(res.data?.liked);
  }

  // ─── Retweet ───

  /** Retweet a post */
  async retweet(userId: string, tweetId: string): Promise<boolean> {
    const res = await this.request<XApiResponse<{ retweeted?: boolean }>>(
      "POST",
      `${BASE_URL}/users/${userId}/retweets`,
      { tweet_id: tweetId }
    );
    return Boolean(res.data?.retweeted);
  }

  // ─── Follow ───

  /** Follow a user */
  async follow(sourceUserId: string, targetUserId: string): Promise<boolean> {
    const res = await this.request<XApiResponse<{ following?: boolean }>>(
      "POST",
      `${BASE_URL}/users/${sourceUserId}/following`,
      { target_user_id: targetUserId }
    );
    return Boolean(res.data?.following);
  }

  /** Unfollow a user */
  async unfollow(sourceUserId: string, targetUserId: string): Promise<boolean> {
    const res = await this.request<XApiResponse<{ following?: boolean }>>(
      "DELETE",
      `${BASE_URL}/users/${sourceUserId}/following/${targetUserId}`
    );
    return !Boolean(res.data?.following);
  }
}
