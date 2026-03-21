import { describe, expect, it } from "bun:test"
import { topic } from "./topic"

describe("topic()", () => {
  it("should store the given path", () => {
    const t = topic("/devices/:deviceId/status", {})
    expect(t.path).toBe("/devices/:deviceId/status")
  })

  it("should store the given schema", () => {
    const schema = { type: "object" }
    const t = topic("/events", schema)
    expect(t.schema).toBe(schema)
  })

  describe("mqttPath", () => {
    it("should strip the leading slash", () => {
      const t = topic("/events", {})
      expect(t.topic).toBe("events")
    })

    it("should replace a single param with +", () => {
      const t = topic("/devices/:deviceId/status", {})
      expect(t.topic).toBe("devices/+/status")
    })

    it("should be able to replace multiple params with +", () => {
      const t = topic("/ward/:wardId/bed/:bedId/event", {})
      expect(t.topic).toBe("ward/+/bed/+/event")
    })

    it("should handle a trailing param", () => {
      const t = topic("/devices/:deviceId", {})
      expect(t.topic).toBe("devices/+")
    })

    it("should return the path unchanged when there are no params", () => {
      const t = topic("/static/topic", {})
      expect(t.topic).toBe("static/topic")
    })
  })
})
