# Client Reference

## Creating a Client

**Two-arg form** (client config + options):
```ts
import { topiq } from 'topiq'

const client = topiq(
  { host: 'broker.example.com', port: 1883 },
  { topics: { deviceStatus, telemetry } }
)
```

**Single-arg form** (combined config):
```ts
const client = topiq({
  client: { url: 'mqtt://broker.example.com:1883' },
  topics: { deviceStatus, telemetry },
})
```

## Connection Config

**Via host/port:**

| Field | Type | Default |
|---|---|---|
| `host` | `string` | required |
| `port` | `number` | `1883` (or `8883` with TLS) |
| `protocol` | `string` | `"mqtt"` (or `"mqtts"` with TLS) |
| `tls` | `true \| TLSConfig` | — |
| `username` | `string` | — |
| `password` | `string` | — |

**Via URL:**

| Field | Type |
|---|---|
| `url` | `string` — e.g. `"mqtt://broker.example.com:1883"` |
| `tls` | `true \| TLSConfig` |
| `username` | `string` |
| `password` | `string` |

## TLS

```ts
// Simple TLS (uses mqtts:// and port 8883)
const client = topiq({ host: 'broker.example.com', tls: true }, { topics })

// Mutual TLS with certificates
const client = topiq({
  host: 'broker.example.com',
  tls: {
    ca: await Bun.file('ca.crt').text(),
    key: await Bun.file('client.key').text(),
    cert: await Bun.file('client.crt').text(),
  },
}, { topics })
```

## Options

```ts
{ topics: Record<string, Topic> }
```

All topics used with `.on()`, `.emit()`, or `.stream()` must be registered here. Unregistered topics throw `UnregisteredTopicError` at call time.

## Properties

| Property | Type | Description |
|---|---|---|
| `.isConnected` | `boolean` | Whether the underlying MQTT client is connected |
