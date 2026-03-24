import { mock } from "bun:test"
import { EventEmitter } from "node:events"

export type FakeMqttClient = EventEmitter & {
  subscribe: ReturnType<typeof mock>
  publish: ReturnType<typeof mock>
  end: ReturnType<typeof mock>
  connected: boolean
}

export function makeMqttClient(): {
  client: FakeMqttClient
  connectSpy: ReturnType<typeof mock>
} {
  const client = Object.assign(new EventEmitter(), {
    subscribe: mock(),
    publish: mock(),
    end: mock(),
    connected: false,
  }) as FakeMqttClient

  const connectSpy = mock(() => client)

  mock.module("mqtt", () => ({
    default: {
      connect: connectSpy,
    },
  }))

  return { client, connectSpy }
}
