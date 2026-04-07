<div align="center">

<br />

# Topiq

### Type-safe MQTT for TypeScript.

Define topics once with a Zod schema — get fully typed publish, subscribe, and streaming out of the box.

<br />

[![npm version](https://img.shields.io/npm/v/topiq?style=for-the-badge&logo=npm&color=CB3837&logoColor=white)](https://www.npmjs.com/package/topiq)
[![license](https://img.shields.io/badge/license-MIT-22C55E?style=for-the-badge)](./LICENSE)
[![typescript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![bun](https://img.shields.io/badge/Bun-ready-F9F1E1?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh)

<br />

[Quick Start](#install) · [Why Topiq](#why-topiq) · [Usage](#usage) · [API](#api) · [Contributing](#contributing)

<br />

</div>

---

## Why Topiq?

MQTT libraries give you raw strings and untyped buffers. You end up parsing, validating, and casting payloads by hand — everywhere. Topiq flips that: you declare your topics with a schema once, and every `.on()`, `.emit()`, and `.stream()` call is fully typed and validated automatically.

```ts
// ❌ Before — string topics, untyped buffers, manual parsing
client.subscribe('devices/+/status')
client.on('message', (topic, payload) => {
  const data = JSON.parse(payload.toString()) // unknown, no validation
})

// ✅ After — typed topics, validated payloads, zero boilerplate
const client = topiq(config, { topics: { deviceStatus } })

client.on(deviceStatus, (data, { topic, params }) => {
  console.log(data.online)      // boolean — inferred from your Zod schema
  console.log(params.deviceId)  // string — extracted from the MQTT topic
})
```

---

## Features

| | |
|---|---|
| **Type-safe topics** | Define topics with Express-style path params — TypeScript infers everything |
| **Schema validation** | Every payload is validated against a Zod schema before reaching your handler |
| **Path params** | `/devices/:deviceId/status` → automatically extracted as `{ deviceId: string }` |
| **Async streaming** | Consume messages as an `AsyncIterable` with `AbortSignal` support |
| **TLS support** | Pass `tls: true` for automatic MQTTS, or provide your own certificates |
| **Dual factory API** | Pass a flat config or `{ client, topics }` — both are fully typed |

---

## Install

Topiq requires **zod** as a peer dependency. Install both together:

```bash
bun add topiq zod
# or
npm install topiq zod
```

If you already have zod in your project, installing `topiq` alone is enough — just make sure zod `>=3.0.0` is present.

---

## Agent Skill

An agent skill is available to give AI coding assistants full knowledge of the topiq API — topics, client config, pub/sub, streaming, errors, and types.

```bash
bun x skills add joao-coimbra/topiq
```

Once installed, your AI assistant will automatically apply topiq patterns when working in a project that uses it.

---

## Usage

### Define your topics

```ts
import { topic } from 'topiq'
import { z } from 'zod'

const deviceStatus = topic('devices/:deviceId/status', z.object({
  online: z.boolean(),
  battery: z.number(),
}))

const telemetry = topic('devices/:deviceId/telemetry', z.object({
  temperature: z.number(),
  humidity: z.number(),
}))
```

### Create a client

```ts
import { topiq } from 'topiq'

const client = topiq(
  { host: 'broker.example.com', port: 1883 },
  { topics: { deviceStatus, telemetry } }
)
```

Or pass a single config object:

```ts
const client = topiq({
  client: { url: 'mqtt://broker.example.com:1883' },
  topics: { deviceStatus, telemetry },
})
```

### Subscribe — `on()`

```ts
const unsubscribe = client.on(deviceStatus, (data, { topic, params }) => {
  // data is fully typed: { online: boolean, battery: number }
  console.log(data.online, data.battery)
  console.log(params.deviceId) // e.g. "abc-123"
  console.log(topic)           // e.g. "devices/abc-123/status"
})

unsubscribe() // remove the handler when done
```

### Publish — `emit()`

Use `.build()` to construct the concrete topic string before publishing:

```ts
client.emit(
  deviceStatus.build({ deviceId: 'abc-123' }),
  { online: true, battery: 87 }
)
```

Or pass the topic string directly if you already have it:

```ts
client.emit('devices/abc-123/status', { online: true, battery: 87 })
```

### Stream — `stream()`

Consume messages as an async iterable. Pass an `AbortSignal` to stop the stream:

```ts
const controller = new AbortController()

for await (const { data, topic } of client.stream(telemetry, controller.signal)) {
  console.log(data.temperature, data.humidity)
  console.log(topic) // e.g. "devices/abc-123/telemetry"
}

// call controller.abort() from outside this loop to stop the stream early
```

### TLS

```ts
// Automatic — switches to mqtts:// and port 8883
const client = topiq({ host: 'broker.example.com', tls: true }, { topics })

// With certificates
const client = topiq({
  host: 'broker.example.com',
  tls: {
    ca: await Bun.file('ca.crt').text(),
    key: await Bun.file('client.key').text(),
    cert: await Bun.file('client.crt').text(),
  },
}, { topics })
```

---

## API

### `topic(path, schema)`

Creates a typed topic definition.

```ts
const deviceStatus = topic('devices/:deviceId/status', z.object({
  online: z.boolean(),
}))
```

| Property / Method | Description |
|---|---|
| `.topic` | MQTT wildcard pattern, e.g. `"devices/+/status"` |
| `.schema` | The Zod schema instance |
| `.build(params)` | Builds a concrete topic string, e.g. `"devices/abc-123/status"`. Throws `MissingParamError` if a param is missing. |
| `.extractParams(mqttTopic)` | Extracts path params from a live MQTT topic string. Throws `TopicPatternMismatchError` if the topic doesn't match. |

---

### `topiq(client, options)` / `topiq(config)`

Creates a `TopiqClient`.

**Client config — provide either `url` or `host`, not both:**

By URL:

| Field | Type | Required | Example |
|---|---|---|---|
| `url` | `string` | ✓ | `"mqtt://broker.example.com:1883"` |
| `tls` | `true \| TLSConfig` | | `true` |
| `username` | `string` | | |
| `password` | `string` | | |

By host:

| Field | Type | Required | Example |
|---|---|---|---|
| `host` | `string` | ✓ | `"broker.example.com"` |
| `port` | `number` | | `1883` |
| `protocol` | `string` | | `"mqtt"`, `"mqtts"` |
| `tls` | `true \| TLSConfig` | | `true` |
| `username` | `string` | | |
| `password` | `string` | | |

---

### `TopiqClient`

| Method | Description |
|---|---|
| `.on(topic, (data, { topic, params }) => void)` | Subscribe and receive validated payloads. Returns an unsubscribe function. |
| `.emit(concreteTopic, data)` | Publish a typed payload to a concrete topic string. |
| `.stream(topic, signal?)` | Returns an `AsyncIterable<{ data, topic }>`. |
| `.ready(timeout?)` | Resolves when connected. Rejects after `timeout` ms (default: 1000). |
| `.disconnect()` | Close the MQTT connection. |
| `.isConnected` | `true` when the underlying client is connected. |

---

### Errors

```ts
import {
  MissingParamError,
  TopicPatternMismatchError,
  TopicValidationError,
  UnregisteredTopicError,
} from 'topiq/errors'
```

| Error | Description |
|---|---|
| `TopicValidationError` | Payload failed Zod schema validation |
| `TopicPatternMismatchError` | MQTT topic string doesn't match the registered pattern |
| `MissingParamError` | A required path param was missing from a `.build()` call |
| `UnregisteredTopicError` | A topic pattern is not registered with the client |

---

## Architecture

```
src/
├── topiq.ts          # TopiqClient class and topiq() factory
├── topic.ts          # Topic class and topic() factory
├── types/
│   ├── topic-pattern.ts    # TopicPattern<T> — Express path → MQTT wildcard
│   └── extract-params.ts   # ExtractParams<T> — typed path param extraction
└── errors/
    ├── missing-param.error.ts
    ├── topic-pattern-mismatch.error.ts
    ├── topic-validation.error.ts
    └── unregistered-topic.error.ts
```

Test infrastructure lives in `test/factories/` and `test/helpers/` — not co-located with source.

---

## Development

**Requirements:** Bun >= 1.0, Docker (for E2E tests)

```bash
bun install          # install dependencies
bun test             # run unit tests
bun x ultracite fix  # lint + format
```

### Testing

```bash
bun test             # unit tests (no external dependencies)
bun run test:e2e     # e2e tests — spins up a Mosquitto broker via Docker
```

Unit tests live alongside source as `*.spec.ts`. E2E tests are `*.e2e-spec.ts` and run against a real Mosquitto 2 broker managed by Docker Compose.

### CI

Every pull request runs three parallel jobs via GitHub Actions:

| Job | What it checks |
|---|---|
| `lint` | Biome via Ultracite (`bun x ultracite check`) |
| `test` | Unit tests (`bun test`) |
| `e2e` | Integration tests against a real MQTT broker |

Releases are published to npm automatically when a `v*.*.*` tag is pushed, using [OIDC Trusted Publisher](https://docs.npmjs.com/generating-provenance-statements) — no long-lived token stored in secrets.

---

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/joao-coimbra/topiq/issues). For significant features, open a [Discussion](https://github.com/joao-coimbra/topiq/discussions) first.

```bash
bun install          # setup
bun test             # make sure everything passes
bun x ultracite fix  # format before committing
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.). Pull requests are squash-merged.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community standards.

---

<div align="center">

**Built with ❤️ for the TypeScript community.**

[Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [MIT License](./LICENSE)

</div>
