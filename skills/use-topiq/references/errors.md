# Errors Reference

All error classes are exported from both `topiq` (main entry) and `topiq/errors`.

```ts
import { MissingParamError, TopicPatternMismatchError, TopicValidationError, UnregisteredTopicError } from 'topiq'
// or
import { MissingParamError, TopicPatternMismatchError, TopicValidationError, UnregisteredTopicError } from 'topiq/errors'
```

## Error Summary

| Error | Thrown by | Key properties |
|---|---|---|
| `MissingParamError` | `topic.build()` | `.param: string` |
| `TopicPatternMismatchError` | `topic.extractParams()` | `.topic: string`, `.pattern: string` |
| `TopicValidationError` | internal (silent in handlers) | `.topic: string`, `.cause: ZodError` |
| `UnregisteredTopicError` | `.on()`, `.emit()`, `.stream()` | `.pattern: string` |

## `MissingParamError`

Thrown when `.build()` is called without a required path param.

```ts
const t = topic('devices/:deviceId/status', z.object({ online: z.boolean() }))

try {
  t.build({})
} catch (err) {
  if (err instanceof MissingParamError) {
    console.error(err.param)     // "deviceId"
    console.error(err.message)   // 'Missing required param "deviceId"'
  }
}
```

## `TopicPatternMismatchError`

Thrown when `.extractParams()` receives a topic string that doesn't match the pattern.

```ts
try {
  t.extractParams('devices/abc/telemetry') // wrong pattern
} catch (err) {
  if (err instanceof TopicPatternMismatchError) {
    console.error(err.topic)     // "devices/abc/telemetry"
    console.error(err.pattern)   // "devices/+/status"
  }
}
```

Rarely caught directly — `.on()` and `.stream()` call `.extractParams()` internally and silently skip mismatches.

## `TopicValidationError`

Thrown internally when a received payload fails Zod schema validation. **Not propagated** to `.on()` or `.stream()` callbacks — invalid messages are silently skipped.

To catch validation errors manually:
```ts
const result = deviceStatus.schema.safeParse(unknownData)
if (!result.success) {
  console.error(result.error) // ZodError
}
```

Properties: `.topic: string`, `.cause: ZodError`, `.name: "TopicValidationError"`

## `UnregisteredTopicError`

Thrown when `.on()`, `.emit()`, or `.stream()` receives a topic that wasn't registered in `topics: { ... }` at client creation.

```ts
try {
  client.on(unregisteredTopic, () => {})
} catch (err) {
  if (err instanceof UnregisteredTopicError) {
    console.error(err.pattern)   // the unregistered MQTT pattern
  }
}
```

Fix: add the topic to the `topics` option when calling `topiq()`.
