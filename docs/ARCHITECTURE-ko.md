# 아키텍처

## 개요

twx-cli는 X (Twitter) REST API v2를 터미널에서 사용하기 위한 TypeScript CLI 도구. 도메인별로 분리된 클라이언트 모듈 구조.

## 프로젝트 구조

```
twx-cli/
├── src/
│   ├── cli.ts              # 진입점, 커맨드 정의 (commander)
│   ├── config.ts            # 크레덴셜 로딩 & 검증
│   └── client/
│       ├── index.ts         # XClient 기반 — OAuth, fetch, rate limiting
│       ├── types.ts         # 공유 타입 정의 (XPost, XUser 등)
│       ├── posts.ts         # 포스트 CRUD, 타임라인, 검색
│       ├── users.ts         # 유저 조회, 팔로우/언팔로우
│       └── engagement.ts    # 좋아요, 리트윗
├── docs/
│   ├── ARCHITECTURE.md
│   └── ARCHITECTURE-ko.md
├── package.json
├── tsconfig.json
└── README.md
```

## 모듈 다이어그램

```
                    ┌──────────────┐
                    │   cli.ts     │
                    │  - 커맨드     │
                    │  - 출력       │
                    │  - 라우팅     │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
  ┌────────────┐   ┌────────────┐    ┌──────────────┐
  │ config.ts  │   │   chalk    │    │   client/    │
  │ (크레덴셜)  │   │  (출력)    │    ├──────────────┤
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
                              │  (서명)    │ │  (REST)   │
                              └───────────┘ └───────────┘
```

## 모듈 상세

### `cli.ts` — 진입점 & 커맨드

commander로 CLI 구조 정의.

**서브커맨드 (12개):**

| 커맨드 | 설명 |
|--------|------|
| `init` | 인터랙티브 크레덴셜 설정 |
| `post <text>` | 새 포스트(트윗) 작성 |
| `thread <tweets...>` | 스레드 작성 (연쇄 포스트) |
| `delete <id>` | 포스트 삭제 |
| `me` | 인증된 사용자 정보 |
| `user <username>` | 유저 조회 |
| `timeline` | 내 최근 포스트 (페이지네이션 지원) |
| `search <query>` | 최근 포스트 검색 (페이지네이션 지원) |
| `like <tweet-id>` | 좋아요 |
| `retweet <tweet-id>` | 리트윗 |
| `follow <username>` | 팔로우 |
| `unfollow <username>` | 언팔로우 |

커맨드 핸들러 흐름:
1. `getClient()`로 `XClient` 초기화
2. 도메인 모듈 함수 호출 (예: `posts.createPost(client, ...)`)
3. chalk 또는 JSON(`--json`)으로 출력

### `client/types.ts` — 공유 타입 정의

모든 공유 TypeScript 인터페이스와 타입이 여기에 정의:
- `RequestMethod` — HTTP 메서드 유니온 타입
- `XPost`, `XUser` — 핵심 도메인 모델
- `XPublicMetrics`, `XUserMetrics` — 메트릭 타입
- `XApiResponse<T>`, `XApiMeta` — API 응답 래퍼
- `XPaginatedResult<T>` — 페이지네이션 결과 타입
- `XClientOptions` — 클라이언트 설정

`index.ts`를 통해 재내보내기됨. 도메인 모듈은 `types.ts`에서 직접 임포트.

### `client/index.ts` — 기반 클라이언트

Node.js 내장 `fetch` + OAuth 1.0a 서명.

**역할:**
- OAuth 1.0a 요청 서명 (HMAC-SHA1)
- Rate limit 감지 및 자동 재시도 (최대 2회)
- JSON 응답 파싱 + 에러 처리
- `types.ts`의 모든 타입 재내보내기

### `client/posts.ts` — 포스트 관련

| 함수 | HTTP | 엔드포인트 |
|------|------|-----------|
| `createPost` | POST | `/2/tweets` |
| `deletePost` | DELETE | `/2/tweets/{id}` |
| `getUserPosts` | GET | `/2/users/{id}/tweets` |
| `searchRecent` | GET | `/2/tweets/search/recent` |

### `client/users.ts` — 유저 관련

| 함수 | HTTP | 엔드포인트 |
|------|------|-----------|
| `me` | GET | `/2/users/me` |
| `getUser` | GET | `/2/users/by/username/{username}` |
| `follow` | POST | `/2/users/{id}/following` |
| `unfollow` | DELETE | `/2/users/{id}/following/{target_id}` |

### `client/engagement.ts` — 인터랙션

| 함수 | HTTP | 엔드포인트 |
|------|------|-----------|
| `like` | POST | `/2/users/{id}/likes` |
| `unlike` | DELETE | `/2/users/{id}/likes/{tweet_id}` |
| `retweet` | POST | `/2/users/{id}/retweets` |

### `config.ts` — 크레덴셜 관리

**로딩 우선순위:**
1. 환경변수 (우선)
2. `~/.config/twx-cli/config.json`

## 인증

모든 엔드포인트에 **OAuth 1.0a** (User Context) 사용:

```
consumer_key + consumer_secret + access_token + access_token_secret
→ HMAC-SHA1 서명 → Authorization 헤더
```

## 의존성

| 패키지 | 용도 |
|--------|------|
| `commander` | CLI 인자 파싱 |
| `oauth-1.0a` | OAuth 1.0a 요청 서명 |
| `chalk` | 터미널 컬러 출력 |

**Node.js 내장:** `crypto`, `fetch` (Node >= 18), `fs`, `path`

## 설계 결정

- **함수형 모듈 패턴**: 도메인 함수가 `XClient`를 첫 파라미터로 받음 — 테스트·조합 용이
- **도메인 분리**: `posts`, `users`, `engagement` — 각 모듈이 하나의 관심사 담당
- **Native fetch**: HTTP 라이브러리 의존성 없음
- **OAuth 1.0a**: 브라우저 리다이렉트 불필요, CLI에 적합
- **config.json in ~/.config/**: XDG 호환, 레포에 크레덴셜 유출 방지
- **Rate limit 자동 재시도**: `x-rate-limit-reset` 헤더 기반, 최대 2회
- **커서 페이지네이션**: `--all`, `--max` 플래그로 timeline/search 전체 조회
