import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import type { XCredentials } from "./config.js";

const BASE_URL = "https://api.x.com/2";

export class XClient {
  private oauth: OAuth;
  private token: { key: string; secret: string };
  private bearerToken?: string;

  constructor(credentials: XCredentials) {
    this.oauth = new OAuth({
      consumer: { key: credentials.apiKey, secret: credentials.apiSecret },
      signature_method: "HMAC-SHA1",
      hash_function(baseString, key) {
        return createHmac("sha1", key).update(baseString).digest("base64");
      },
    });
    this.token = { key: credentials.accessToken, secret: credentials.accessTokenSecret };
    this.bearerToken = credentials.bearerToken;
  }

  /** Safely parse JSON response, handling non-JSON bodies */
  private async parseResponse(res: Response): Promise<unknown> {
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`X API error ${res.status}: ${text.slice(0, 200)}`);
      }
      return {};
    }

    if (!res.ok) {
      const detail = (data as any)?.detail ?? (data as any)?.title ?? JSON.stringify(data);
      throw new Error(`X API error ${res.status}: ${detail}`);
    }

    return data;
  }

  /** Make an OAuth 1.0a signed request */
  private async request(method: string, url: string, body?: unknown): Promise<unknown> {
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

    return this.parseResponse(res);
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
    const res = await this.request("POST", `${BASE_URL}/tweets`, body);
    return (res as any).data;
  }

  /** Delete a post */
  async deletePost(id: string): Promise<boolean> {
    const res = await this.request("DELETE", `${BASE_URL}/tweets/${id}`);
    return (res as any).data.deleted;
  }

  // ─── Users ───

  /** Get authenticated user's info */
  async me(): Promise<{ id: string; name: string; username: string }> {
    const res = await this.request("GET", `${BASE_URL}/users/me?user.fields=id,name,username,description,public_metrics`);
    return (res as any).data;
  }

  /** Get user by username */
  async getUser(username: string): Promise<unknown> {
    const res = await this.request("GET", `${BASE_URL}/users/by/username/${username}?user.fields=id,name,username,description,public_metrics`);
    return (res as any).data;
  }

  // ─── Timeline ───

  /** Get user's recent posts (max_results: 5-100) */
  async getUserPosts(userId: string, maxResults = 10): Promise<unknown[]> {
    const clamped = Math.max(5, Math.min(100, maxResults));
    const res = await this.request(
      "GET",
      `${BASE_URL}/users/${userId}/tweets?max_results=${clamped}&tweet.fields=created_at,public_metrics,text`
    );
    return (res as any).data ?? [];
  }

  // ─── Search ───

  /** Search recent posts (max_results: 10-100) */
  async searchRecent(query: string, maxResults = 10): Promise<unknown[]> {
    const clamped = Math.max(10, Math.min(100, maxResults));
    const encoded = encodeURIComponent(query);
    const res = await this.request(
      "GET",
      `${BASE_URL}/tweets/search/recent?query=${encoded}&max_results=${clamped}&tweet.fields=created_at,public_metrics,author_id,text`
    );
    return (res as any).data ?? [];
  }

  // ─── Likes ───

  /** Like a post */
  async like(userId: string, tweetId: string): Promise<boolean> {
    const res = await this.request("POST", `${BASE_URL}/users/${userId}/likes`, {
      tweet_id: tweetId,
    });
    return (res as any).data.liked;
  }

  /** Unlike a post */
  async unlike(userId: string, tweetId: string): Promise<boolean> {
    const res = await this.request("DELETE", `${BASE_URL}/users/${userId}/likes/${tweetId}`);
    return !(res as any).data.liked;
  }

  // ─── Retweet ───

  /** Retweet a post */
  async retweet(userId: string, tweetId: string): Promise<boolean> {
    const res = await this.request("POST", `${BASE_URL}/users/${userId}/retweets`, {
      tweet_id: tweetId,
    });
    return (res as any).data.retweeted;
  }

  // ─── Follow ───

  /** Follow a user */
  async follow(sourceUserId: string, targetUserId: string): Promise<boolean> {
    const res = await this.request("POST", `${BASE_URL}/users/${sourceUserId}/following`, {
      target_user_id: targetUserId,
    });
    return (res as any).data.following;
  }

  /** Unfollow a user */
  async unfollow(sourceUserId: string, targetUserId: string): Promise<boolean> {
    const res = await this.request("DELETE", `${BASE_URL}/users/${sourceUserId}/following/${targetUserId}`);
    return !(res as any).data.following;
  }
}
