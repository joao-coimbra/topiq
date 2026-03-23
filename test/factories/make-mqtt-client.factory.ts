import { mock } from "bun:test"
import { EventEmitter } from "node:events"

export type FakeMqttClient = EventEmitter & {
  subscribe: ReturnType<typeof mock>
  publish: ReturnType<typeof mock>
  end: ReturnType<typeof mock>
}

/**
 * Creates a fully isolated fake MQTT client and registers it as the mock
 * for the `mqtt` module. Safe to call inside `beforeEach`.
 */
export function makeMqttClient(): {
  client: FakeMqttClient
  connectSpy: ReturnType<typeof mock>
} {
  const client = Object.assign(new EventEmitter(), {
    subscribe: mock(),
    publish: mock(),
    end: mock(),
  }) as FakeMqttClient

  const connectSpy = mock(() => client)

  mock.module("mqtt", () => ({
    default: {
      connect: connectSpy,
    },
  }))

  return { client, connectSpy }
}
