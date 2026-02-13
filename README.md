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
- **Zero config** — Just set 4 env vars and go

## Install

```bash
npm install -g twx-cli
```

Or use directly:
```bash
npx twx-cli post "Hello!"
```

## Setup

Get your API keys from [console.x.com](https://console.x.com):

```bash
# .env or ~/.config/twx-cli/.env
X_API_KEY=your_api_key
X_API_SECRET=your_api_secret
X_ACCESS_TOKEN=your_access_token
X_ACCESS_TOKEN_SECRET=your_access_token_secret
X_BEARER_TOKEN=your_bearer_token  # optional, needed for search
```

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

### Timeline

```bash
# Your recent posts
twx timeline

# Last 5 posts
twx timeline -n 5
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
1. Environment variables
2. `.env` in current directory
3. `~/.config/twx-cli/.env`

## Requirements

- Node.js >= 18
- X API v2 access ([console.x.com](https://console.x.com))

## License

MIT
