#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { loadCredentials, saveConfig, getConfigPath } from "./config.js";
import { XClient, type XPost, type XPaginatedResult } from "./client.js";
import { createInterface } from "readline";

interface GlobalOptions {
  json?: boolean;
}

interface PaginationCommandOptions {
  count: string;
  all?: boolean;
  max?: string;
}

const DEFAULT_TIMELINE_COUNT = "10";
const DEFAULT_SEARCH_COUNT = "10";
let jsonOutput = process.argv.includes("--json");

function getClient(): XClient {
  const creds = loadCredentials();
  return new XClient(creds, {
    onRateLimit: jsonOutput ? undefined : (message) => {
      console.warn(chalk.yellow("⚠"), message);
    },
  });
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const program = new Command()
  .name("twx")
  .description("A fast, lightweight CLI for the X (Twitter) API v2")
  .version("0.1.0")
  .option("--json", "Output raw JSON for command results");

program.hook("preAction", (thisCommand) => {
  jsonOutput = Boolean((thisCommand.optsWithGlobals() as GlobalOptions).json);
});

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parsePositiveInt(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function renderPosts(posts: XPost[], emptyMessage: string): void {
  if (!posts.length) {
    console.log(chalk.dim(emptyMessage));
    return;
  }

  for (const p of posts) {
    const date = p.created_at ? new Date(p.created_at).toLocaleString() : "";
    console.log(chalk.dim(date), chalk.dim(`[${p.id}]`));
    console.log(p.text);
    if (p.public_metrics) {
      const m = p.public_metrics;
      console.log(chalk.dim(`  ♥ ${m.like_count}  ↻ ${m.retweet_count}  💬 ${m.reply_count}`));
    }
    console.log();
  }
}

async function paginatePosts(
  fetchPage: (count: number, token?: string) => Promise<XPaginatedResult<XPost>>,
  perPage: number,
  opts: { all?: boolean; max?: number }
): Promise<{ data: XPost[]; pagesFetched: number; nextToken?: string }> {
  const limit = opts.all ? Number.POSITIVE_INFINITY : (opts.max ?? perPage);
  const posts: XPost[] = [];
  const seenTokens = new Set<string>();
  let token: string | undefined;
  let pagesFetched = 0;

  while (posts.length < limit) {
    const remaining = Number.isFinite(limit) ? limit - posts.length : perPage;
    const requestCount = Math.max(1, Math.min(perPage, remaining));
    const page = await fetchPage(requestCount, token);
    pagesFetched += 1;
    posts.push(...page.data);

    if (!page.nextToken || seenTokens.has(page.nextToken)) {
      token = undefined;
      break;
    }

    seenTokens.add(page.nextToken);
    token = page.nextToken;
  }

  if (Number.isFinite(limit) && posts.length > limit) {
    posts.length = limit;
  }

  return { data: posts, pagesFetched, nextToken: token };
}

// ─── init ───
program
  .command("init")
  .description("Set up API credentials interactively")
  .action(async () => {
    console.log(chalk.bold("twx-cli setup"));
    console.log(chalk.dim("Get your keys at https://console.x.com\n"));

    const api_key = await prompt("API Key: ");
    const api_secret = await prompt("API Secret: ");
    const access_token = await prompt("Access Token: ");
    const access_token_secret = await prompt("Access Token Secret: ");
    const bearer_token = await prompt("Bearer Token (optional, press Enter to skip): ");

    if (!api_key || !api_secret || !access_token || !access_token_secret) {
      console.error(chalk.red("✗"), "API Key, Secret, Access Token, and Access Token Secret are required.");
      process.exit(1);
    }

    saveConfig({
      api_key,
      api_secret,
      access_token,
      access_token_secret,
      ...(bearer_token ? { bearer_token } : {}),
    });

    console.log(chalk.green("✓"), `Saved to ${getConfigPath()}`);
  });

// ─── post ───
program
  .command("post <text>")
  .description("Create a new post (tweet)")
  .option("--reply-to <id>", "Reply to a post by ID")
  .option("--quote <id>", "Quote a post by ID")
  .option("--dry-run", "Print the post without sending")
  .action(async (text: string, opts: { replyTo?: string; quote?: string; dryRun?: boolean }) => {
    if (!text.trim()) {
      console.error(chalk.red("✗"), "Post text cannot be empty.");
      process.exit(1);
    }
    if (opts.dryRun) {
      if (jsonOutput) {
        printJson({
          dry_run: true,
          text,
          reply_to: opts.replyTo ?? null,
          quote_tweet_id: opts.quote ?? null,
        });
        return;
      }
      console.log(chalk.yellow("[dry-run]"), text);
      return;
    }
    const client = getClient();
    const result = await client.createPost(text, {
      replyTo: opts.replyTo,
      quoteTweetId: opts.quote,
    });
    if (jsonOutput) {
      printJson(result);
      return;
    }
    console.log(chalk.green("✓ Posted:"), `https://x.com/i/status/${result.id}`);
    console.log(chalk.dim(result.text));
  });

// ─── thread ───
program
  .command("thread <tweets...>")
  .description("Create a thread from multiple posts")
  .option("--dry-run", "Print the thread without sending")
  .action(async (tweets: string[], opts: { dryRun?: boolean }) => {
    const normalized = tweets.map((tweet) => tweet.trim()).filter(Boolean);
    if (!normalized.length) {
      console.error(chalk.red("✗"), "Thread must include at least one non-empty post.");
      process.exit(1);
    }

    if (opts.dryRun) {
      const preview = normalized.map((text, index) => ({
        index: index + 1,
        text,
        reply_to_index: index > 0 ? index : null,
      }));
      if (jsonOutput) {
        printJson({ dry_run: true, posts: preview });
      } else {
        console.log(chalk.yellow("[dry-run] Thread preview:"));
        for (const item of preview) {
          const replyInfo = item.reply_to_index ? ` (replies to #${item.reply_to_index})` : "";
          console.log(`${item.index}. ${item.text}${replyInfo}`);
        }
      }
      return;
    }

    const client = getClient();
    const posted: Array<{ index: number; id: string; text: string; reply_to_id: string | null; url: string }> = [];
    let previousId: string | undefined;

    for (let index = 0; index < normalized.length; index += 1) {
      if (!jsonOutput) {
        console.log(chalk.dim(`Posting ${index + 1}/${normalized.length}...`));
      }
      const created = await client.createPost(
        normalized[index],
        previousId ? { replyTo: previousId } : undefined
      );

      posted.push({
        index: index + 1,
        id: created.id,
        text: created.text,
        reply_to_id: previousId ?? null,
        url: `https://x.com/i/status/${created.id}`,
      });
      previousId = created.id;

      if (!jsonOutput) {
        console.log(chalk.green("✓ Posted"), `${index + 1}/${normalized.length}`, `https://x.com/i/status/${created.id}`);
      }
    }

    if (jsonOutput) {
      printJson({ data: posted });
      return;
    }

    console.log(chalk.green("✓ Thread complete"), `(${posted.length} posts)`);
  });

// ─── delete ───
program
  .command("delete <id>")
  .description("Delete a post by ID")
  .action(async (id: string) => {
    const client = getClient();
    const deleted = await client.deletePost(id);
    if (jsonOutput) {
      printJson({ id, deleted });
      return;
    }
    if (deleted) {
      console.log(chalk.green("✓ Deleted"), id);
    } else {
      console.log(chalk.red("✗ Failed to delete"), id);
    }
  });

// ─── me ───
program
  .command("me")
  .description("Show authenticated user info")
  .action(async () => {
    const client = getClient();
    const user = await client.me();
    if (jsonOutput) {
      printJson(user);
      return;
    }
    console.log(chalk.bold(`@${user.username}`), chalk.dim(`(${user.name})`));
    if (user.description) console.log(user.description);
    if (user.public_metrics) {
      const m = user.public_metrics;
      console.log(
        chalk.dim(`${m.followers_count} followers · ${m.following_count} following · ${m.tweet_count} posts`)
      );
    }
  });

// ─── user ───
program
  .command("user <username>")
  .description("Get user info by username")
  .action(async (username: string) => {
    const client = getClient();
    const user = await client.getUser(username.replace(/^@/, ""));
    if (jsonOutput) {
      printJson(user);
      return;
    }
    console.log(chalk.bold(`@${user.username}`), chalk.dim(`(${user.name})`));
    if (user.description) console.log(user.description);
    if (user.public_metrics) {
      const m = user.public_metrics;
      console.log(
        chalk.dim(`${m.followers_count} followers · ${m.following_count} following · ${m.tweet_count} posts`)
      );
    }
  });

// ─── timeline ───
program
  .command("timeline")
  .description("Show your recent posts (supports pagination)")
  .option("-n, --count <n>", "Number of posts per request", DEFAULT_TIMELINE_COUNT)
  .option("--all", "Fetch all available posts using cursor pagination")
  .option("--max <n>", "Fetch up to N posts using cursor pagination")
  .action(async (opts: PaginationCommandOptions) => {
    if (opts.all && opts.max) {
      throw new Error("Use either --all or --max with timeline, not both.");
    }

    const count = parsePositiveInt(opts.count, "--count");
    const max = opts.max ? parsePositiveInt(opts.max, "--max") : undefined;
    const client = getClient();
    const me = await client.me();

    if (!opts.all && !opts.max) {
      const page = await client.getUserPosts(me.id, count);
      if (jsonOutput) {
        printJson(page);
        return;
      }
      renderPosts(page.data, "No posts found.");
      return;
    }

    const result = await paginatePosts(
      (pageCount, token) => client.getUserPosts(me.id, pageCount, token),
      count,
      { all: opts.all, max }
    );

    if (jsonOutput) {
      printJson({
        data: result.data,
        meta: {
          pages_fetched: result.pagesFetched,
          next_token: result.nextToken ?? null,
          result_count: result.data.length,
        },
      });
      return;
    }

    renderPosts(result.data, "No posts found.");
  });

// ─── search ───
program
  .command("search <query>")
  .description("Search recent posts (supports pagination)")
  .option("-n, --count <n>", "Number of results per request", DEFAULT_SEARCH_COUNT)
  .option("--all", "Fetch all available results using cursor pagination")
  .option("--max <n>", "Fetch up to N results using cursor pagination")
  .action(async (query: string, opts: PaginationCommandOptions) => {
    if (opts.all && opts.max) {
      throw new Error("Use either --all or --max with search, not both.");
    }

    const client = getClient();
    const count = parsePositiveInt(opts.count, "--count");

    if (!opts.all && !opts.max) {
      const page = await client.searchRecent(query, count);
      if (jsonOutput) {
        printJson(page);
        return;
      }
      renderPosts(page.data, "No results.");
      return;
    }

    const max = opts.max ? parsePositiveInt(opts.max, "--max") : undefined;
    const result = await paginatePosts(
      (pageCount, token) => client.searchRecent(query, pageCount, token),
      count,
      { all: opts.all, max }
    );

    if (jsonOutput) {
      printJson({
        data: result.data,
        meta: {
          pages_fetched: result.pagesFetched,
          next_token: result.nextToken ?? null,
          result_count: result.data.length,
        },
      });
      return;
    }

    renderPosts(result.data, "No results.");
  });

// ─── like ───
program
  .command("like <tweet-id>")
  .description("Like a post")
  .action(async (tweetId: string) => {
    const client = getClient();
    const me = await client.me();
    const liked = await client.like(me.id, tweetId);
    if (jsonOutput) {
      printJson({ tweet_id: tweetId, liked });
      return;
    }
    console.log(liked ? chalk.green("✓ Liked") : chalk.red("✗ Failed"), tweetId);
  });

// ─── retweet ───
program
  .command("retweet <tweet-id>")
  .description("Retweet a post")
  .action(async (tweetId: string) => {
    const client = getClient();
    const me = await client.me();
    const ok = await client.retweet(me.id, tweetId);
    if (jsonOutput) {
      printJson({ tweet_id: tweetId, retweeted: ok });
      return;
    }
    console.log(ok ? chalk.green("✓ Retweeted") : chalk.red("✗ Failed"), tweetId);
  });

// ─── follow ───
program
  .command("follow <username>")
  .description("Follow a user")
  .action(async (username: string) => {
    const client = getClient();
    const me = await client.me();
    const target = await client.getUser(username.replace(/^@/, ""));
    const ok = await client.follow(me.id, target.id);
    if (jsonOutput) {
      printJson({ username: target.username, user_id: target.id, following: ok });
      return;
    }
    console.log(ok ? chalk.green(`✓ Following @${target.username}`) : chalk.red("✗ Failed"));
  });

// ─── unfollow ───
program
  .command("unfollow <username>")
  .description("Unfollow a user")
  .action(async (username: string) => {
    const client = getClient();
    const me = await client.me();
    const target = await client.getUser(username.replace(/^@/, ""));
    const ok = await client.unfollow(me.id, target.id);
    if (jsonOutput) {
      printJson({ username: target.username, user_id: target.id, unfollowed: ok });
      return;
    }
    console.log(ok ? chalk.green(`✓ Unfollowed @${target.username}`) : chalk.red("✗ Failed"));
  });

program.parseAsync().catch((err: Error) => {
  if (jsonOutput) {
    printJson({ error: err.message });
    process.exit(1);
  }
  console.error(chalk.red("✗"), err.message);
  process.exit(1);
});
