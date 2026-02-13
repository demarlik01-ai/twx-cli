# Architecture

## Overview

twx-cli is a TypeScript CLI application that wraps the X (Twitter) REST API v2 for terminal usage. It follows a modular architecture with domain-separated client modules.

## Project Structure

```
twx-cli/
├── src/
│   ├── cli.ts              # Entry point, command definitions (commander)
│   ├── config.ts            # Credential loading & validation
│   └── client/
│       ├── index.ts         # XClient base — OAuth, fetch, rate limiting
│       ├── types.ts         # Shared type definitions (XPost, XUser, etc.)
│       ├── posts.ts         # Post CRUD, timeline, search
│       ├── users.ts         # User lookup, follow/unfollow
│       └── engagement.ts    # Like, unlike, retweet
├── docs/
│   ├── ARCHITECTURE.md
│   └── ARCHITECTURE-ko.md
├── package.json
├── tsconfig.json
└── README.md
```

## Module Diagram

```
                    ┌──────────────┐
                    │   cli.ts     │
                    │  - Commands  │
                    │  - Output    │
                    │  - Routing   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
  ┌────────────┐   ┌────────────┐    ┌──────────────┐
  │ config.ts  │   │   chalk    │    │   client/    │
  │(credentials)   │  (output)  │    ├──────────────┤
  └────────────┘   └────────────┘    │  index.ts    │
                                     │  posts.ts    │
                                     │  users.ts    │
                                     │ engagement.ts│
                                     └──────┬───────┘
                                            │
                                     ┌──────┴──────┐
                                     ▼             ▼
                              ┌───────────┐ ┌───────────┐
                              │ oauth-1.0a│ │ X API v2  │
                              │ (signing) │ │  (REST)   │
                              └───────────┘ └───────────┘
```

## Modules

### `cli.ts` — Entry Point & Commands

Defines the CLI structure using commander.

**Subcommands (12):**

| Command | Description |
|---------|-------------|
| `init` | Interactive credential setup |
| `post <text>` | Create a new post (tweet) |
| `thread <tweets...>` | Create a thread from multiple posts |
| `delete <id>` | Delete a post by ID |
| `me` | Show authenticated user info |
| `user <username>` | Get user info by username |
| `timeline` | Show your recent posts (with pagination) |
| `search <query>` | Search recent posts (with pagination) |
| `like <tweet-id>` | Like a post |
| `retweet <tweet-id>` | Retweet a post |
| `follow <username>` | Follow a user |
| `unfollow <username>` | Unfollow a user |

Each command handler:
1. Initializes `XClient` via `getClient()`
2. Calls the appropriate module function (e.g. `posts.createPost(client, ...)`)
3. Formats and prints output with chalk (or JSON with `--json`)

### `client/types.ts` — Shared Type Definitions

All shared TypeScript interfaces and types live here:
- `RequestMethod` — HTTP method union type
- `XPost`, `XUser` — Core domain models
- `XPublicMetrics`, `XUserMetrics` — Metrics types
- `XApiResponse<T>`, `XApiMeta` — API response wrappers
- `XPaginatedResult<T>` — Paginated result type
- `XClientOptions` — Client configuration

Re-exported through `index.ts` for convenience. Domain modules import types directly from `types.ts`.

### `client/index.ts` — Base Client

`XClient` wraps Node.js native `fetch` with OAuth 1.0a signing.

**Responsibilities:**
- OAuth 1.0a request signing (HMAC-SHA1)
- Rate limit detection and auto-retry (up to 2 retries)
- JSON response parsing with error handling
- Re-exports all types from `types.ts`

The `request()` method is public so domain modules can use it directly.

### `client/posts.ts` — Post Operations

| Function | HTTP | Endpoint |
|----------|------|----------|
| `createPost` | POST | `/2/tweets` |
| `deletePost` | DELETE | `/2/tweets/{id}` |
| `getUserPosts` | GET | `/2/users/{id}/tweets` |
| `searchRecent` | GET | `/2/tweets/search/recent` |

### `client/users.ts` — User Operations

| Function | HTTP | Endpoint |
|----------|------|----------|
| `me` | GET | `/2/users/me` |
| `getUser` | GET | `/2/users/by/username/{username}` |
| `follow` | POST | `/2/users/{id}/following` |
| `unfollow` | DELETE | `/2/users/{id}/following/{target_id}` |

### `client/engagement.ts` — Engagement Operations

| Function | HTTP | Endpoint |
|----------|------|----------|
| `like` | POST | `/2/users/{id}/likes` |
| `unlike` | DELETE | `/2/users/{id}/likes/{tweet_id}` |
| `retweet` | POST | `/2/users/{id}/retweets` |

### `config.ts` — Credential Management

**Credential resolution priority:**
1. Environment variables (takes precedence)
2. `~/.config/twx-cli/config.json`

**Supported variable names:**

| Primary | Alias (backward compat) |
|---------|------------------------|
| `X_API_KEY` | `TWITTER_API_KEY` |
| `X_API_SECRET` | `TWITTER_API_SECRET` |
| `X_ACCESS_TOKEN` | `TWITTER_ACCESS_TOKEN` |
| `X_ACCESS_TOKEN_SECRET` | `TWITTER_ACCESS_TOKEN_SECRET` |
| `X_BEARER_TOKEN` | `TWITTER_BEARER_TOKEN` |

## Authentication Flow

All endpoints use **OAuth 1.0a** (User Context):

```
consumer_key + consumer_secret + access_token + access_token_secret
→ HMAC-SHA1 signature in Authorization header
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI argument parsing |
| `oauth-1.0a` | OAuth 1.0a request signing |
| `chalk` | Terminal color output |

**Node.js built-ins used:**
- `crypto` — HMAC-SHA1 for OAuth signing
- `fetch` — HTTP requests (Node >= 18)
- `fs`, `path` — Config file loading

## Design Decisions

- **Functional module pattern**: Domain functions take `XClient` as first parameter instead of class methods — easier to test and compose
- **Domain separation**: `posts`, `users`, `engagement` — each module handles one concern
- **Native fetch**: No HTTP library dependency — Node >= 18 has fetch built-in
- **OAuth 1.0a over OAuth 2.0 PKCE**: Simpler for CLI tools — no browser redirect needed
- **TWITTER_* aliases**: Backward compatibility with existing env setups
- **config.json in ~/.config/**: XDG-compliant, credentials don't leak into repos
- **Rate limit auto-retry**: Up to 2 retries with exponential backoff from `x-rate-limit-reset` header
- **Cursor pagination**: `--all` and `--max` flags for timeline and search
