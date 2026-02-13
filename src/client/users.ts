import type { XApiResponse, XUser } from "./types.js";
import { type XClient, BASE_URL } from "./index.js";

/** Get authenticated user's info */
export async function me(client: XClient): Promise<XUser> {
  const res = await client.request<XApiResponse<XUser>>(
    "GET",
    `${BASE_URL}/users/me?user.fields=id,name,username,description,public_metrics`,
  );
  if (!res.data) {
    throw new Error("X API returned no authenticated user data.");
  }
  return res.data;
}

/** Get user by username */
export async function getUser(client: XClient, username: string): Promise<XUser> {
  const res = await client.request<XApiResponse<XUser>>(
    "GET",
    `${BASE_URL}/users/by/username/${username}?user.fields=id,name,username,description,public_metrics`,
  );
  if (!res.data) {
    throw new Error(`X API returned no user data for @${username}.`);
  }
  return res.data;
}

/** Follow a user */
export async function follow(client: XClient, sourceUserId: string, targetUserId: string): Promise<boolean> {
  const res = await client.request<XApiResponse<{ following?: boolean }>>(
    "POST",
    `${BASE_URL}/users/${sourceUserId}/following`,
    { target_user_id: targetUserId },
  );
  return Boolean(res.data?.following);
}

/** Unfollow a user */
export async function unfollow(client: XClient, sourceUserId: string, targetUserId: string): Promise<boolean> {
  const res = await client.request<XApiResponse<{ following?: boolean }>>(
    "DELETE",
    `${BASE_URL}/users/${sourceUserId}/following/${targetUserId}`,
  );
  return res.data?.following === false;
}
