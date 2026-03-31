# Types Reference

All types are exported from `topiq`.

## `TopicPattern<T>`

Converts an Express-style path string to an MQTT wildcard pattern at the type level.

```ts
import type { TopicPattern } from 'topiq'

type T1 = TopicPattern<'devices/:deviceId/status'>   // "devices/+/status"
type T2 = TopicPattern<'events'>                      // "events"
type T3 = TopicPattern<'ward/:wardId/bed/:bedId'>    // "ward/+/bed/+"
```

## `ExtractParams<T>`

Extracts typed path parameters from an Express-style path.

```ts
import type { ExtractParams } from 'topiq'

type T1 = ExtractParams<'devices/:deviceId/status'>  // { deviceId: string }
type T2 = ExtractParams<'events'>                     // never
type T3 = ExtractParams<'ward/:wardId/bed/:bedId'>   // { wardId: string; bedId: string }
```

## `ConcreteTopic<T>`

Produces the concrete string type for a given MQTT pattern (template literal).

```ts
import type { ConcreteTopic } from 'topiq'

type T1 = ConcreteTopic<'devices/+/status'>  // `devices/${string}/status`
type T2 = ConcreteTopic<'events'>             // "events"
```

Used internally for type narrowing in `.emit()`.

## `Params<T>`

Branded wrapper for extracted path params — ensures type safety between param extraction and usage.

```ts
import type { Params } from 'topiq'

type DeviceParams = Params<{ deviceId: string }>
```

The `params` object in `.on()` and `.stream()` callbacks is typed as `Params<ExtractParams<TPath>>`.

## `StreamMessage<T>`

The type of objects yielded by `.stream()`.

```ts
import type { StreamMessage } from 'topiq'

interface StreamMessage<T> {
  data: T        // validated payload (inferred from Zod schema)
  topic: string  // raw MQTT topic string
}
```

```ts
for await (const msg of client.stream(deviceStatus)) {
  msg.data   // { online: boolean; battery: number }
  msg.topic  // "devices/abc-123/status"
}
```
