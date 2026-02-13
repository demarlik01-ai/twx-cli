// ─── Shared Types ───

export type RequestMethod = "GET" | "POST" | "DELETE";

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

export interface XApiResponse<T> {
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
