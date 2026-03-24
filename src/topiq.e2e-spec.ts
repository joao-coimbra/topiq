import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"
import { sleep } from "bun"
import { z } from "zod"
import { waitFor } from "../test/helpers/wait-for"
import { topic } from "./topic"
import { type TopiqClient, topiq } from "./topiq"

const host = process.env.E2E_MQTT_HOST ?? "127.0.0.1"

const temperature = topic(
  "sensors/:sensorId/temperature",
  z.object({ celsius: z.number() })
)

type Client = TopiqClient<{ temperature: typeof temperature }>

describe("topiq e2e", () => {
  let client: Client

  beforeAll(async () => {
    client = topiq({ host }, { topics: { temperature } })
    await client.ready()
  })

  afterAll(() => {
    client.disconnect()
  })

  describe("on()", () => {
    it("should receive a real message from the broker with data and context", async () => {
      const callback = mock()
      const off = client.on(temperature, callback)

      client.emit(temperature.build({ sensorId: "s1" }), { celsius: 22 })

      await waitFor(() => {
        expect(callback).toHaveBeenCalledWith(
          { celsius: 22 },
          { topic: "sensors/s1/temperature", params: { sensorId: "s1" } }
        )
      })

      off()
    })

    it("should stop receiving after unsubscribe", async () => {
      const callback = mock()
      const off = client.on(temperature, callback)
      off()

      client.emit(temperature.build({ sensorId: "s2" }), { celsius: 5 })

      await sleep(150)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe("emit()", () => {
    it("should publish a payload that is delivered over the real broker", async () => {
      const callback = mock()
      const off = client.on(temperature, callback)

      client.emit(temperature.build({ sensorId: "emit-test" }), { celsius: 37 })

      await waitFor(() => {
        expect(callback).toHaveBeenCalledWith(
          { celsius: 37 },
          expect.objectContaining({ topic: "sensors/emit-test/temperature" })
        )
      })

      off()
    })
  })

  describe("stream()", () => {
    it("should yield a real message arriving from the broker", async () => {
      const controller = new AbortController()
      const iterator = client
        .stream(temperature, controller.signal)
        [Symbol.asyncIterator]()

      const nextPromise = iterator.next()

      await sleep(50)
      client.emit(temperature.build({ sensorId: "stream-1" }), { celsius: 18 })

      const result = await nextPromise

      expect(result.done).toBe(false)
      expect(result.value).toEqual({
        topic: "sensors/stream-1/temperature",
        data: { celsius: 18 },
      })

      controller.abort()
    })

    it("should terminate when AbortSignal is aborted", async () => {
      const controller = new AbortController()
      const iterator = client
        .stream(temperature, controller.signal)
        [Symbol.asyncIterator]()

      const nextPromise = iterator.next()
      controller.abort()

      const result = await nextPromise
      expect(result.done).toBe(true)
    })
  })

  describe("disconnect()", () => {
    it("should mark the client as disconnected", async () => {
      const disposable = topiq({ host }, { topics: { temperature } })
      await disposable.ready()

      expect(disposable.isConnected).toBe(true)

      disposable.disconnect()

      await waitFor(() => {
        expect(disposable.isConnected).toBe(false)
      })
    })
  })
})
