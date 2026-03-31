---
name: topiq
description: Use when working with topiq — defining MQTT topics, creating a TopiqClient, publishing or subscribing to messages, streaming, or handling topiq errors.
---

# topiq

Type-safe MQTT pub/sub for TypeScript. Topics are defined with Express-style paths and Zod schemas; the client handles wildcard matching, param extraction, and payload validation automatically.

## Key Triggers

Activate this skill when working with:
- `topic()` or `Topic` — defining MQTT topic patterns
- `topiq()` or `TopiqClient` — creating or configuring the client
- `.emit()`, `.on()`, `.stream()` — publishing or subscribing to messages
- Zod schemas attached to MQTT topics
- Any topiq error class (`MissingParamError`, `TopicValidationError`, etc.)

## Core Rules

**Topic Definition:** Use `topic(path, schema)` with an Express-style path and a Zod schema. Paths use `:param` syntax — topiq auto-converts them to `+` MQTT wildcards. Import `z` from `zod`.

**Publishing:** `.emit()` takes a **concrete** topic string — never a `Topic` instance. Always call `.build(params)` first:
```ts
client.emit(deviceStatus.build({ deviceId: 'abc' }), { online: true, battery: 85 })
```

**Subscribing:** `.on(topic, callback)` and `.stream(topic, signal?)` receive typed `data` plus a `{ topic, params }` context. Params are extracted automatically — no manual parsing needed.

**Silent Validation:** Invalid payloads in `.on()` and `.stream()` are silently skipped. Validate manually with `.schema.safeParse()` if you need error visibility.

**Connection:** Call `await client.ready()` before publishing when connection timing matters. Default timeout is 1000ms.

**Registration:** All topics must be registered in `topics: { ... }` when creating the client. Unregistered topics throw `UnregisteredTopicError`.

## Testing & Documentation

Tests use `bun:test`, co-located as `*.spec.ts`. Test factories live in `test/factories/`.

## References

- [`references/topic.md`](references/topic.md) — `topic()`, `.build()`, `.extractParams()`, path patterns
- [`references/client.md`](references/client.md) — `topiq()` factory, connection config, TLS
- [`references/api.md`](references/api.md) — `.on()`, `.emit()`, `.stream()`, `.ready()`, `.disconnect()`
- [`references/errors.md`](references/errors.md) — all 4 error classes, when they throw, key properties
- [`references/types.md`](references/types.md) — `TopicPattern`, `ExtractParams`, `ConcreteTopic`, `StreamMessage`
