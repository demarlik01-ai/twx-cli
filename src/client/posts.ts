import type { XApiResponse, XPost, XPaginatedResult } from "./types.js";
import { type XClient, BASE_URL } from "./index.js";

/** Create a new post (tweet) */
export async function createPost(
  client: XClient,
  text: string,
  options?: { replyTo?: string; quoteTweetId?: string },
): Promise<{ id: string; text: string }> {
  const body: Record<string, unknown> = { text };
  if (options?.replyTo) {
    body.reply = { in_reply_to_tweet_id: options.replyTo };
  }
  if (options?.quoteTweetId) {
    body.quote_tweet_id = options.quoteTweetId;
  }
  const res = await client.request<XApiResponse<XPost>>("POST", `${BASE_URL}/tweets`, body);
  if (!res.data) {
    throw new Error("X API returned no post data.");
  }
  return res.data;
}

/** Delete a post */
export async function deletePost(client: XClient, id: string): Promise<boolean> {
  const res = await client.request<XApiResponse<{ deleted?: boolean }>>("DELETE", `${BASE_URL}/tweets/${id}`);
  return Boolean(res.data?.deleted);
}

/** Get user's recent posts (max_results: 5-100) */
export async function getUserPosts(
  client: XClient,
  userId: string,
  maxResults = 10,
  paginationToken?: string,
): Promise<XPaginatedResult<XPost>> {
  const clamped = Math.max(5, Math.min(100, maxResults));
  const params = new URLSearchParams({
    max_results: String(clamped),
    "tweet.fields": "created_at,public_metrics,text",
  });
  if (paginationToken) {
    params.set("pagination_token", paginationToken);
  }
  const res = await client.request<XApiResponse<XPost[]>>(
    "GET",
    `${BASE_URL}/users/${userId}/tweets?${params.toString()}`,
  );
  return {
    data: Array.isArray(res.data) ? res.data : [],
    nextToken: res.meta?.next_token,
    meta: res.meta,
  };
}

/** Search recent posts (max_results: 10-100) */
export async function searchRecent(
  client: XClient,
  query: string,
  maxResults = 10,
  paginationToken?: string,
): Promise<XPaginatedResult<XPost>> {
  const clamped = Math.max(10, Math.min(100, maxResults));
  const params = new URLSearchParams({
    query,
    max_results: String(clamped),
    "tweet.fields": "created_at,public_metrics,author_id,text",
  });
  if (paginationToken) {
    params.set("next_token", paginationToken);
  }
  const res = await client.request<XApiResponse<XPost[]>>(
    "GET",
    `${BASE_URL}/tweets/search/recent?${params.toString()}`,
  );
  return {
    data: Array.isArray(res.data) ? res.data : [],
    nextToken: res.meta?.next_token,
    meta: res.meta,
  };
}
