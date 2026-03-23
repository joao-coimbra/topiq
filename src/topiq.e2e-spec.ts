import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  mock,
} from "bun:test"
import { waitFor } from "test/helpers/wait-for"
import { z } from "zod"
import { topic } from "./topic"
import { topiq } from "./topiq"

// biome-ignore lint/style/noNonNullAssertion: env already validated
const MQTT_HOST = process.env.E2E_MQTT_HOST!

const topics = {
  deviceStatus: topic(
    "/devices/:deviceId/status",
    z.object({
      online: z.boolean(),
      battery: z.number(),
    })
  ),
}

const client = topiq(
  {
    host: MQTT_HOST,
  },
  { topics }
)

describe("Topiq", () => {
  beforeAll(async () => {
    await client.ready()
  })

  it("should connect to the MQTT broker", () => {
    expect(client.isConnected).toBeTrue()
  })

  describe("on()", () => {
    let unsubscribe: () => void
    let callback: Mock<(data: unknown, context: unknown) => void>

    beforeEach(() => {
      callback = mock()
      unsubscribe = client.on(topics.deviceStatus, callback)
    })

    afterEach(() => {
      unsubscribe()
    })

    it("should subscribe to the MQTT pattern on the first call", async () => {
      client.emit(topics.deviceStatus.build({ deviceId: "abc" }), {
        online: true,
        battery: 80,
      })

      await waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith(
          { online: true, battery: 80 },
          { topic: "devices/abc/status", params: { deviceId: "abc" } }
        )
      })
    })
  })
})
