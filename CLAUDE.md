
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Merge Procedure

- Always merge pull requests using **Squash and Merge** (`--squash`)
- Never `--delete-branch` — the repo auto-deletes merged branches
- Always sync main after merge

```bash
gh pr merge <number> --squash
git checkout main && git pull
```

### Branch Full Flow

```bash
git checkout -b <type>/<name>
# ... commits ...
git push -u origin <type>/<name>
gh pr create --title "<title>" --body "<body>"
gh pr merge <number> --squash
git checkout main && git pull
```

## Release Procedure

- Never `git push --tags` — pushes all local tags including unintended ones
- Never create git tags for RC versions — tag only stable releases
- Always use annotated tags (`-a`) — the Release GA reads the message as the GitHub Release body
- GA does **not** publish to npm — publish locally first, then tag
- Working tree must be clean before `bun pm version`

### Stable Release

**Tag message format** — the Release GA uses the tag message verbatim as the GitHub Release body. Write it as:

```
v<x.y.z> — <one-line summary of the release>

<one or two sentences describing the problem solved or the motivation>

Changes:
- <concrete change 1 — what was done and why it matters>
- <concrete change 2>
```

Example:

```
v1.3.1 — Add shouldRun flag to DomainEvents for test control

Adds a shouldRun property to DomainEventsImplementation so tests can disable
event dispatching without clearing and re-registering handlers. Also adds
afterEach isolation and dedicated shouldRun coverage to the spec.

Changes:
- Add shouldRun = true flag — set to false to suppress dispatch in tests
- Add afterEach cleanup (clearHandlers, clearMarkedAggregates, reset shouldRun)
- Add test asserting handlers are not called when shouldRun is false
```

```bash
bun pm version <x.y.z>
# bun pm version creates an annotated tag automatically, but with no changelog.
# Always delete and recreate it with a proper message before doing anything else:
git tag -d v<x.y.z>
git tag -a v<x.y.z> -m "v<x.y.z> — <summary>

<motivation paragraph>

Changes:
- change 1
- change 2"

bun run release                          # publishes to npm with dist-tag latest

git checkout -b release/v<x.y.z>
git push -u origin release/v<x.y.z>
gh pr create --title "chore: release v<x.y.z>" --body "..."
gh pr merge <number> --squash --auto     # auto-merges after CI passes
# wait for merge confirmation, then:
git checkout main && git pull

git push origin v<x.y.z>
```

### RC / Pre-release

```bash
bun pm version prerelease --preid rc
bun run release --tag next
# commit + push via PR — NO git tag for RCs
```

### dist-tags

| Tag | Use |
|-----|-----|
| `latest` | stable releases |
| `next` | RC / pre-release |

## Project Architecture

```
src/
├── topiq.ts          # TopiqClient class and topiq() factory
├── topic.ts          # Topic class and topic() factory
├── types/
│   ├── index.ts            # Barrel — re-exports all public types
│   ├── topic-pattern.ts    # TopicPattern<T> — Express path → MQTT wildcard (tail-recursive)
│   └── extract-params.ts   # ExtractParams<T> — typed path param extraction
└── errors/
    ├── index.ts                          # Barrel — re-exports all error classes
    ├── missing-param.error.ts            # Thrown by Topic.build() when a param is missing
    ├── topic-pattern-mismatch.error.ts   # Thrown by extractParams() when topic doesn't match
    ├── topic-validation.error.ts         # Thrown by parse() when Zod validation fails
    └── unregistered-topic.error.ts       # Thrown when a pattern is not registered
```

Test infrastructure lives in `test/factories/` (not co-located with source).

## Key API Conventions

- `Topic<TPath, TParams, TSchema>` — `TPath` is the Express-style path without leading slash (e.g. `"devices/:deviceId/status"`), `TParams` is `Params<{ deviceId: string }>`, `TSchema` is the Zod schema type
- `Topic.build(params)` returns a concrete topic string (e.g. `"devices/abc/status"`) — this is what you pass to `client.emit()`
- `client.emit()` takes a concrete topic string, never a `Topic` instance — always use `.build()` or a literal string
- `client.on()` / `client.stream()` callback: `(data, { topic, params }) => void` — `topic` is the raw MQTT string, `params` is the extracted path params
- All four error classes are exported from the main `topiq` entry point
