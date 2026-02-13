#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { loadCredentials } from "./config.js";
import { XClient } from "./client.js";

function getClient(): XClient {
  const creds = loadCredentials();
  return new XClient(creds);
}

const program = new Command()
  .name("twx")
  .description("A fast, lightweight CLI for the X (Twitter) API v2")
  .version("0.1.0");

// ─── post ───
program
  .command("post <text>")
  .description("Create a new post (tweet)")
  .option("--reply-to <id>", "Reply to a post by ID")
  .option("--quote <id>", "Quote a post by ID")
  .option("--dry-run", "Print the post without sending")
  .action(async (text: string, opts) => {
    if (!text.trim()) {
      console.error(chalk.red("✗"), "Post text cannot be empty.");
      process.exit(1);
    }
    if (opts.dryRun) {
      console.log(chalk.yellow("[dry-run]"), text);
      return;
    }
    const client = getClient();
    const result = await client.createPost(text, {
      replyTo: opts.replyTo,
      quoteTweetId: opts.quote,
    });
    console.log(chalk.green("✓ Posted:"), `https://x.com/i/status/${result.id}`);
    console.log(chalk.dim(result.text));
  });

// ─── delete ───
program
  .command("delete <id>")
  .description("Delete a post by ID")
  .action(async (id: string) => {
    const client = getClient();
    const deleted = await client.deletePost(id);
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
    console.log(chalk.bold(`@${user.username}`), chalk.dim(`(${user.name})`));
    const u = user as any;
    if (u.description) console.log(u.description);
    if (u.public_metrics) {
      const m = u.public_metrics;
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
    const user = await client.getUser(username.replace(/^@/, "")) as any;
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
  .description("Show your recent posts")
  .option("-n, --count <n>", "Number of posts", "10")
  .action(async (opts) => {
    const client = getClient();
    const me = await client.me();
    const count = parseInt(opts.count) || 10;
    const posts = await client.getUserPosts(me.id, count) as any[];
    if (!posts.length) {
      console.log(chalk.dim("No posts found."));
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
  });

// ─── search ───
program
  .command("search <query>")
  .description("Search recent posts")
  .option("-n, --count <n>", "Number of results", "10")
  .action(async (query: string, opts) => {
    const client = getClient();
    const count = parseInt(opts.count) || 10;
    const posts = await client.searchRecent(query, count) as any[];
    if (!posts.length) {
      console.log(chalk.dim("No results."));
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
  });

// ─── like ───
program
  .command("like <tweet-id>")
  .description("Like a post")
  .action(async (tweetId: string) => {
    const client = getClient();
    const me = await client.me();
    const liked = await client.like(me.id, tweetId);
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
    console.log(ok ? chalk.green("✓ Retweeted") : chalk.red("✗ Failed"), tweetId);
  });

// ─── follow ───
program
  .command("follow <username>")
  .description("Follow a user")
  .action(async (username: string) => {
    const client = getClient();
    const me = await client.me();
    const target = await client.getUser(username.replace(/^@/, "")) as any;
    const ok = await client.follow(me.id, target.id);
    console.log(ok ? chalk.green(`✓ Following @${target.username}`) : chalk.red("✗ Failed"));
  });

// ─── unfollow ───
program
  .command("unfollow <username>")
  .description("Unfollow a user")
  .action(async (username: string) => {
    const client = getClient();
    const me = await client.me();
    const target = await client.getUser(username.replace(/^@/, "")) as any;
    const ok = await client.unfollow(me.id, target.id);
    console.log(ok ? chalk.green(`✓ Unfollowed @${target.username}`) : chalk.red("✗ Failed"));
  });

program.parseAsync().catch((err: Error) => {
  console.error(chalk.red("✗"), err.message);
  process.exit(1);
});
