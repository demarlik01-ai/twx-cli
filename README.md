# twx-cli

A fast, lightweight CLI for the X (Twitter) API v2.

```bash
npx twx-cli post "Hello from the terminal!"
```

## Features

- **Post** — Create, delete, quote, reply
- **Timeline** — View your recent posts
- **Search** — Search recent posts
- **Users** — Lookup user profiles
- **Like / Retweet / Follow** — Engage with posts and users
- **Dry-run** — Preview posts before sending
- **Threads** — Post multi-tweet threads in one command
- **JSON output** — `--json` flag for scripting
- **Zero config** — Just set 4 env vars and go

## Install

```bash
npm install -g twx-cli
# or
pnpm add -g twx-cli
# or
bun add -g twx-cli
```

Or use directly without installing:
```bash
npx twx-cli post "Hello!"
```

## Setup

Get your API keys from [console.x.com](https://console.x.com):

```bash
twx init
```

This saves your credentials to `~/.config/twx-cli/config.json` (mode 600).

Or create it manually:
```json
{
  "api_key": "your_api_key",
  "api_secret": "your_api_secret",
  "access_token": "your_access_token",
  "access_token_secret": "your_access_token_secret",
  "bearer_token": "your_bearer_token"
}
```

Environment variables (`X_API_KEY`, etc.) take precedence over config file.

Make sure your app has **Read and Write** permissions and OAuth 1.0a enabled.

## Usage

### Post

```bash
# Simple post
twx post "Shipping code at 2am"

# Reply to a post
twx post "Great point!" --reply-to 1234567890

# Quote a post
twx post "This is huge 👀" --quote 1234567890

# Dry run (preview without posting)
twx post "Testing..." --dry-run
```

### Thread

```bash
# Post a thread (each argument = one tweet)
twx thread "First tweet" "Second tweet" "Third tweet"

# Dry run
twx thread "Part 1" "Part 2" --dry-run
```

### Timeline

```bash
# Your recent posts
twx timeline

# Last 5 posts
twx timeline -n 5

# Fetch all with pagination
twx timeline --all

# Fetch up to 50
twx timeline --max 50
```

### Search

```bash
twx search "typescript cli"
twx search "#buildinpublic" -n 20
```

### Users

```bash
# Your profile
twx me

# Lookup a user
twx user elonmusk
```

### Engage

```bash
twx like 1234567890
twx retweet 1234567890
twx follow @username
twx unfollow @username
```

## Authentication

twx-cli uses **OAuth 1.0a** (User Context) for most operations and optionally **Bearer Token** (App-only) for search.

Credentials are loaded in order:
1. Environment variables (`X_API_KEY`, `X_API_SECRET`, etc.)
2. `~/.config/twx-cli/config.json`

## Project Structure

```
src/
├── cli.ts              # Command definitions (commander)
├── config.ts           # Credential loading & validation
└── client/
    ├── index.ts        # XClient base (OAuth, fetch, rate limiting)
    ├── types.ts        # Shared type definitions (XPost, XUser, etc.)
    ├── posts.ts        # Post CRUD, timeline, search
    ├── users.ts        # User lookup, follow/unfollow
    └── engagement.ts   # Like, unlike, retweet
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Requirements

- Node.js >= 18
- X API v2 access ([console.x.com](https://console.x.com))

## License

MIT
