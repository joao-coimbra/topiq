# Topic Reference

## Creating Topics

```ts
import { topic } from 'topiq'
import { z } from 'zod'

const deviceStatus = topic(
  'devices/:deviceId/status',
  z.object({ online: z.boolean(), battery: z.number() })
)
```

`topic(path, schema)` returns a `Topic<TPath, TParams, TSchema>` instance.

- `path` — Express-style string; leading `/` is optional
- `schema` — any Zod schema; used for payload validation on receive and type inference

## Path → MQTT Pattern Conversion

| Express path | MQTT pattern |
|---|---|
| `devices/:deviceId/status` | `devices/+/status` |
| `events` | `events` |
| `ward/:wardId/bed/:bedId` | `ward/+/bed/+` |
| `:a/:b` | `+/+` |

`:param` segments become `+` (single-level wildcard). Static segments are unchanged.

## Instance Properties

| Property | Type | Description |
|---|---|---|
| `.topic` | `string` | The MQTT wildcard pattern (e.g. `"devices/+/status"`) |
| `.schema` | `ZodType` | The Zod schema instance |

## `.build(params?)`

Substitutes path params to produce a concrete topic string for publishing.

```ts
deviceStatus.build({ deviceId: 'abc-123' })
// → "devices/abc-123/status"

// Static topics need no params
const events = topic('events', z.object({ type: z.string() }))
events.build()
// → "events"
```

Throws `MissingParamError` if a required param is absent.

## `.extractParams(mqttTopic)`

Extracts path params from a live MQTT topic string.

```ts
deviceStatus.extractParams('devices/sensor-42/status')
// → { deviceId: "sensor-42" }
```

Throws `TopicPatternMismatchError` if the topic doesn't match the pattern. Rarely needed directly — `.on()` and `.stream()` call this automatically and expose params in the callback context.

## Multi-Param Example

```ts
const roomSensor = topic(
  'building/:buildingId/floor/:floor/sensor/:sensorId',
  z.object({ temp: z.number() })
)

roomSensor.build({ buildingId: 'north', floor: '3', sensorId: 's-01' })
// → "building/north/floor/3/sensor/s-01"

roomSensor.extractParams('building/south/floor/2/sensor/s-99')
// → { buildingId: "south", floor: "2", sensorId: "s-99" }
```
