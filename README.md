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

[Quick Start](#install) · [Why Topiq](#why-topiq) · [Usage](#usage) · [API](#api)

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

client.on(deviceStatus, (data) => {
  console.log(data.online) // boolean — inferred from your Zod schema
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
| **Dual factory API** | Pass a flat config or `{ client, options }` — both are fully typed |

---

## Install

```bash
bun add topiq
# or
npm install topiq
```

---

## Usage

### Define your topics

```ts
import { topic } from 'topiq'
import { z } from 'zod'

const deviceStatus = topic('/devices/:deviceId/status', z.object({
  online: z.boolean(),
  battery: z.number(),
}))

const telemetry = topic('/devices/:deviceId/telemetry', z.object({
  temperature: z.number(),
  humidity: z.number(),
}))
```

---

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
  options: { topics: { deviceStatus, telemetry } },
})
```

---

### Subscribe — `on()`

```ts
const unsubscribe = client.on(deviceStatus, (data, rawTopic) => {
  // data is fully typed: { online: boolean, battery: number }
  console.log(data.online, data.battery)
  console.log(rawTopic) // e.g. "devices/abc-123/status"
})

// Remove the handler when done
unsubscribe()
```

---

### Publish — `emit()`

```ts
client.emit(deviceStatus, {
  online: true,
  battery: 87,
  // TypeScript enforces the shape — wrong fields are a compile error
})
```

---

### Stream — `stream()`

Consume messages as an async iterable. Use an `AbortSignal` to stop the stream:

```ts
const controller = new AbortController()

for await (const { data, topic } of client.stream(telemetry, controller.signal)) {
  console.log(data.temperature, data.humidity)
  console.log(topic) // e.g. "devices/abc-123/telemetry"
}

// Stop the stream from outside
controller.abort()
```

---

### TLS

Pass `tls: true` to use MQTTS with the default port (8883), or provide certificates explicitly:

```ts
// Automatic — switches to mqtts:// and port 8883
const client = topiq({ host: 'broker.example.com', tls: true }, { topics })

// With certificates
const client = topiq({
  host: 'broker.example.com',
  tls: {
    ca: Bun.file('ca.crt').text(),
    key: Bun.file('client.key').text(),
    cert: Bun.file('client.crt').text(),
  },
}, { topics })
```

---

## API

### `topic(path, schema)`

Creates a typed topic definition.

```ts
topic('/devices/:deviceId/status', z.object({ online: z.boolean() }))
```

| Property | Description |
|---|---|
| `.path` | The original path string, e.g. `"/devices/:deviceId/status"` |
| `.topic` | The MQTT wildcard pattern, e.g. `"devices/+/status"` |
| `.schema` | The Zod schema |
| `.extractParams(mqttTopic)` | Returns `{ deviceId: string }` from a live MQTT topic string |
| `.parse(data)` | Validates `data` against the schema, throws `TopicValidationError` on failure |

---

### `topiq(client, options)` / `topiq(config)`

Creates a `TopiqClient`.

**Client config:**

| Field | Type | Description |
|---|---|---|
| `url` | `string` | Full broker URL (alternative to host/port) |
| `host` | `string` | Broker hostname |
| `port` | `number` | Broker port (default: `1883` / `8883` with TLS) |
| `protocol` | `string` | Protocol (default: `"mqtt"` / `"mqtts"` with TLS) |
| `tls` | `true \| TLSConfig` | Enable TLS or provide certificates |
| `username` | `string` | Auth username |
| `password` | `string` | Auth password |

---

### `TopiqClient`

| Method | Description |
|---|---|
| `.on(topic, callback)` | Subscribe and receive validated payloads. Returns an unsubscribe function. |
| `.emit(topic, data)` | Publish a typed payload to a topic. |
| `.stream(topic, signal?)` | Returns an `AsyncIterable` of `{ data, topic }` messages. |
| `.disconnect()` | Close the MQTT connection. |

---

## Architecture

```
src/
├── topiq.ts                      # Client factory and TopiqClient class
├── topic.ts                      # Topic definition and param extraction
├── types/
│   ├── topic-pattern.ts          # TopicPattern<T> — path → MQTT wildcard (type-level)
│   ├── extract-params.ts         # ExtractParams<T> — path → param object (type-level)
│   └── topic-event.ts            # TopicEvent<Path, Output> interface
└── errors/
    └── topic-validation.error.ts # Zod validation error wrapper
```

The type-level utilities (`TopicPattern`, `ExtractParams`) are tail-recursive — they handle 200+ wildcards without hitting the TypeScript compiler stack limit.

---

## Technology Stack

| | |
|---|---|
| **Language** | TypeScript 5+ |
| **Runtime / Package Manager** | [Bun](https://bun.sh) |
| **Test Framework** | `bun:test` (built-in) |
| **Schema Validation** | [Zod](https://zod.dev) |
| **MQTT Client** | [mqtt.js](https://github.com/mqttjs/MQTT.js) |
| **Linter / Formatter** | [Biome](https://biomejs.dev) via [Ultracite](https://ultracite.dev) |

---

## Development

Requirements: **Bun >= 1.0**

```bash
bun install          # install dependencies
bun test             # run tests
bun x ultracite fix  # lint + format
```

Test files are `*.spec.ts` co-located with the source they test.

---

<div align="center">

**Built with ❤️ for the TypeScript community.**

[Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [MIT License](./LICENSE)

</div>
