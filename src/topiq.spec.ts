import { beforeEach, describe, expect, it, mock } from "bun:test"
import { z } from "zod"
import {
  type FakeMqttClient,
  makeMqttClient,
} from "../test/factories/make-mqtt-client.factory"

import { topic } from "./topic"
import { topiq } from "./topiq"

const status = topic(
  "/devices/:deviceId/status",
  z.object({
    online: z.boolean(),
    battery: z.number(),
  })
)

function emitMessage(
  client: FakeMqttClient,
  mqttTopic: string,
  payload: unknown
): void {
  client.emit("message", mqttTopic, Buffer.from(JSON.stringify(payload)))
}

describe("topiq()", () => {
  let fakeMqtt: ReturnType<typeof makeMqttClient>

  beforeEach(() => {
    fakeMqtt = makeMqttClient()
  })

  describe("connection", () => {
    it("should call mqtt.connect with the correct URL for host config", () => {
      topiq({ host: "broker.example.com" }, { topics: { status } })

      expect(fakeMqtt.connectSpy).toHaveBeenCalledWith(
        "mqtt://broker.example.com:1883",
        expect.any(Object)
      )
    })

    it("should use mqtts:// scheme and port 8883 when tls: true", () => {
      topiq({ host: "broker.example.com", tls: true }, { topics: { status } })

      expect(fakeMqtt.connectSpy).toHaveBeenCalledWith(
        "mqtts://broker.example.com:8883",
        expect.any(Object)
      )
    })
  })

  describe("on()", () => {
    it("should subscribe to the MQTT pattern on the first call", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )

      client.on(status, mock())

      expect(fakeMqtt.client.subscribe).toHaveBeenCalledTimes(1)
      expect(fakeMqtt.client.subscribe).toHaveBeenCalledWith("devices/+/status")
    })

    it("should not subscribe again on subsequent calls for the same pattern", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )

      client.on(status, mock())
      client.on(status, mock())

      expect(fakeMqtt.client.subscribe).toHaveBeenCalledTimes(1)
    })

    it("should invoke the callback with data and context { topic, params }", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const callback = mock()
      client.on(status, callback)

      emitMessage(fakeMqtt.client, "devices/abc/status", {
        online: true,
        battery: 80,
      })

      expect(callback).toHaveBeenCalledWith(
        { online: true, battery: 80 },
        { topic: "devices/abc/status", params: { deviceId: "abc" } }
      )
    })

    it("should stop invoking the callback after the returned unsubscribe fn is called", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const callback = mock()
      const off = client.on(status, callback)

      off()
      emitMessage(fakeMqtt.client, "devices/abc/status", {
        online: true,
        battery: 80,
      })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe("emit()", () => {
    it("should call publish with the concrete topic string and JSON-serialized payload", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )

      client.emit(status.build({ deviceId: "abc" }), {
        online: true,
        battery: 95,
      })

      expect(fakeMqtt.client.publish).toHaveBeenCalledWith(
        "devices/abc/status",
        JSON.stringify({ online: true, battery: 95 })
      )
    })
  })

  describe("stream()", () => {
    it("should yield arriving messages as an async iterable", async () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const iterator = client.stream(status)[Symbol.asyncIterator]()

      emitMessage(fakeMqtt.client, "devices/abc/status", {
        online: true,
        battery: 60,
      })

      const result = await iterator.next()

      expect(result.done).toBe(false)
      expect(result.value).toEqual({
        topic: "devices/abc/status",
        data: { online: true, battery: 60 },
      })

      await iterator.return?.()
    })

    it("should buffer messages when the iterator is not yet awaiting", async () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const iterator = client.stream(status)[Symbol.asyncIterator]()

      emitMessage(fakeMqtt.client, "devices/abc/status", {
        online: true,
        battery: 50,
      })
      emitMessage(fakeMqtt.client, "devices/xyz/status", {
        online: false,
        battery: 20,
      })

      const first = await iterator.next()
      const second = await iterator.next()

      expect(first.value?.data).toEqual({ online: true, battery: 50 })
      expect(second.value?.data).toEqual({ online: false, battery: 20 })

      await iterator.return?.()
    })

    it("should terminate iteration when the AbortSignal is aborted", async () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const controller = new AbortController()
      const iterator = client
        .stream(status, controller.signal)
        [Symbol.asyncIterator]()

      const nextPromise = iterator.next()
      controller.abort()

      const result = await nextPromise
      expect(result.done).toBe(true)
    })
  })

  describe("disconnect()", () => {
    it("should call client.end()", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )

      client.disconnect()

      expect(fakeMqtt.client.end).toHaveBeenCalledTimes(1)
    })
  })

  describe("wildcard matching", () => {
    it("should match + to exactly one path segment and extract the param", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const callback = mock()
      client.on(status, callback)

      emitMessage(fakeMqtt.client, "devices/sensor-42/status", {
        online: true,
        battery: 75,
      })

      expect(callback).toHaveBeenCalledWith(
        { online: true, battery: 75 },
        {
          topic: "devices/sensor-42/status",
          params: { deviceId: "sensor-42" },
        }
      )
    })

    it("should silently skip messages whose topic spans multiple wildcard levels", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const callback = mock()
      client.on(status, callback)

      emitMessage(fakeMqtt.client, "devices/a/b/status", { temp: 25 })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe("invalid payload", () => {
    it("should silently skip messages that fail zod validation", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const callback = mock()
      client.on(status, callback)

      emitMessage(fakeMqtt.client, "devices/abc/status", { invalid: "data" })

      expect(callback).not.toHaveBeenCalled()
    })

    it("should silently skip messages that do not match the topic pattern", () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const callback = mock()
      client.on(status, callback)

      emitMessage(fakeMqtt.client, "devices/abc/telemetry", { temp: 25 })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe("stream() error handling", () => {
    it("should silently skip messages that fail zod validation", async () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const controller = new AbortController()
      const iterator = client
        .stream(status, controller.signal)
        [Symbol.asyncIterator]()

      emitMessage(fakeMqtt.client, "devices/abc/status", { invalid: "data" })
      emitMessage(fakeMqtt.client, "devices/abc/status", {
        online: true,
        battery: 99,
      })

      const result = await iterator.next()
      expect(result.value?.data).toEqual({ online: true, battery: 99 })
      await iterator.return?.()
    })

    it("should silently skip messages that do not match the topic pattern", async () => {
      const client = topiq(
        { host: "broker.example.com" },
        { topics: { status } }
      )
      const controller = new AbortController()
      const iterator = client
        .stream(status, controller.signal)
        [Symbol.asyncIterator]()

      emitMessage(fakeMqtt.client, "devices/abc/telemetry", { temp: 25 })
      emitMessage(fakeMqtt.client, "devices/abc/status", {
        online: false,
        battery: 10,
      })

      const result = await iterator.next()
      expect(result.value?.data).toEqual({ online: false, battery: 10 })
      await iterator.return?.()
    })
  })
})
