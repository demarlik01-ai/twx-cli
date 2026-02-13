import type { XApiResponse } from "./types.js";
import { type XClient, BASE_URL } from "./index.js";

/** Like a post */
export async function like(client: XClient, userId: string, tweetId: string): Promise<boolean> {
  const res = await client.request<XApiResponse<{ liked?: boolean }>>("POST", `${BASE_URL}/users/${userId}/likes`, {
    tweet_id: tweetId,
  });
  return Boolean(res.data?.liked);
}

/** Unlike a post */
export async function unlike(client: XClient, userId: string, tweetId: string): Promise<boolean> {
  const res = await client.request<XApiResponse<{ liked?: boolean }>>(
    "DELETE",
    `${BASE_URL}/users/${userId}/likes/${tweetId}`,
  );
  return res.data?.liked === false;
}

/** Retweet a post */
export async function retweet(client: XClient, userId: string, tweetId: string): Promise<boolean> {
  const res = await client.request<XApiResponse<{ retweeted?: boolean }>>(
    "POST",
    `${BASE_URL}/users/${userId}/retweets`,
    { tweet_id: tweetId },
  );
  return Boolean(res.data?.retweeted);
}
