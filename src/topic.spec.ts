import { describe, expect, it } from "bun:test"
import { z } from "zod"
import { TopicPatternMismatchError } from "./errors/topic-pattern-mismatch.error"
import { topic } from "./topic"

const statusSchema = z.object({ online: z.boolean(), battery: z.number() })

describe("topic()", () => {
  it("should store the given schema", () => {
    const t = topic("/devices/:deviceId/status", statusSchema)
    expect(t.schema).toBe(statusSchema)
  })

  describe(".topic", () => {
    it("should strip the leading slash", () => {
      const t = topic("/events", statusSchema)
      expect(t.topic).toBe("events")
    })

    it("should replace a single param with +", () => {
      const t = topic("/devices/:deviceId/status", statusSchema)
      expect(t.topic).toBe("devices/+/status")
    })

    it("should replace multiple params with +", () => {
      const t = topic("/ward/:wardId/bed/:bedId/event", statusSchema)
      expect(t.topic).toBe("ward/+/bed/+/event")
    })

    it("should handle a trailing param", () => {
      const t = topic("/devices/:deviceId", statusSchema)
      expect(t.topic).toBe("devices/+")
    })

    it("should return the path unchanged when there are no params", () => {
      const t = topic("/static/topic", statusSchema)
      expect(t.topic).toBe("static/topic")
    })
  })

  describe(".extractParams()", () => {
    it("should extract a single param from a concrete MQTT topic", () => {
      const t = topic("/devices/:deviceId/status", statusSchema)
      expect(t.extractParams("devices/abc-123/status")).toEqual({
        deviceId: "abc-123",
      })
    })

    it("should extract multiple params", () => {
      const t = topic("/ward/:wardId/bed/:bedId/event", statusSchema)
      expect(t.extractParams("ward/42/bed/7/event")).toEqual({
        wardId: "42",
        bedId: "7",
      })
    })

    it("should throw TopicPatternMismatchError when the topic does not match the pattern", () => {
      const t = topic("/devices/:deviceId/status", statusSchema)
      expect(() => t.extractParams("devices/abc/telemetry")).toThrow(
        TopicPatternMismatchError
      )
    })

    it("should return an empty object for a topic with no params", () => {
      const t = topic("/events", statusSchema)
      expect(t.extractParams("events")).toEqual({})
    })
  })

  describe(".schema", () => {
    it("should parse a valid payload", () => {
      const t = topic("/devices/:deviceId/status", statusSchema)
      expect(t.schema.parse({ online: true, battery: 80 })).toEqual({
        online: true,
        battery: 80,
      })
    })

    it("should throw when the payload does not match the schema", () => {
      const t = topic("/devices/:deviceId/status", statusSchema)
      expect(() => t.schema.parse({ invalid: "data" })).toThrow()
    })
  })
})
