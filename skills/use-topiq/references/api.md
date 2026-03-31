# API Reference

## `.on(topic, callback)` — Subscribe

```ts
const unsubscribe = client.on(deviceStatus, (data, { topic, params }) => {
  console.log(data.online)       // typed from Zod schema
  console.log(params.deviceId)   // extracted from MQTT topic
  console.log(topic)             // raw MQTT string: "devices/abc/status"
})

// Stop receiving messages
unsubscribe()
```

- Returns an unsubscribe function — call it to remove the handler
- Lazy: the MQTT subscription happens on the first `.on()` call for a pattern
- Deduplicated: multiple handlers for the same pattern share one MQTT subscription
- Invalid payloads are silently skipped (no callback invocation)

## `.emit(concreteTopic, data)` — Publish

```ts
client.emit(
  deviceStatus.build({ deviceId: 'abc-123' }),
  { online: true, battery: 87 }
)
```

- First arg must be a concrete topic string — use `.build(params)` to produce it
- Payload is automatically JSON-serialized
- TypeScript enforces the payload type matches the topic's schema

## `.stream(topic, signal?)` — Async Stream

```ts
const controller = new AbortController()

for await (const { data, topic } of client.stream(telemetry, controller.signal)) {
  console.log(data.temperature)  // typed
  console.log(topic)             // raw MQTT topic string
}

// Stop from outside the loop
controller.abort()
```

- Returns `AsyncIterable<StreamMessage<T>>`
- Messages are buffered — nothing is dropped between iterations
- Pass an `AbortSignal` to stop the stream externally
- Invalid payloads are silently skipped (same as `.on()`)

**Stream with timeout:**
```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 10_000)

for await (const { data } of client.stream(telemetry, controller.signal)) {
  // ...
}
```

## `.ready(timeout?)` — Wait for Connection

```ts
await client.ready()        // default 1000ms timeout
await client.ready(5000)    // custom timeout
```

- Resolves immediately if already connected
- Rejects if no connection is established within the timeout
- Call before `.emit()` when connection timing matters

## `.disconnect()` — Close Connection

```ts
client.disconnect()
```

Ends the underlying MQTT connection. No further messages will be received after this call.
