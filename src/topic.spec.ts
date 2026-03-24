import { describe, expect, it } from "bun:test"
import { z } from "zod"
import { MissingParamError, TopicPatternMismatchError } from "./errors"
import { topic } from "./topic"

const schema = z.object({ online: z.boolean(), battery: z.number() })

describe("topic()", () => {
  it("should store the given schema on the instance", () => {
    const t = topic("/devices/:deviceId/status", schema)

    expect(t.schema).toBe(schema)
  })

  describe(".topic — MQTT wildcard pattern", () => {
    it("should strip the leading slash", () => {
      const t = topic("/events", schema)

      expect(t.topic).toBe("events")
    })

    it("should replace a single param segment with +", () => {
      const t = topic("/devices/:deviceId/status", schema)

      expect(t.topic).toBe("devices/+/status")
    })

    it("should replace multiple param segments with +", () => {
      const t = topic("/ward/:wardId/bed/:bedId/event", schema)

      expect(t.topic).toBe("ward/+/bed/+/event")
    })

    it("should replace consecutive param segments with +", () => {
      const t = topic("/:wardId/:bedId", schema)

      expect(t.topic).toBe("+/+")
    })

    it("should replace a trailing param segment with +", () => {
      const t = topic("/devices/:deviceId", schema)

      expect(t.topic).toBe("devices/+")
    })

    it("should return the path unchanged when there are no params", () => {
      const t = topic("/static/topic", schema)

      expect(t.topic).toBe("static/topic")
    })
  })

  describe(".build()", () => {
    it("should substitute a single param", () => {
      const t = topic("/devices/:deviceId/status", schema)

      const result = t.build({ deviceId: "abc-123" })

      expect(result).toBe("devices/abc-123/status")
    })

    it("should substitute multiple params", () => {
      const t = topic("/ward/:wardId/bed/:bedId/event", schema)

      const result = t.build({ wardId: "42", bedId: "7" })

      expect(result).toBe("ward/42/bed/7/event")
    })

    it("should substitute consecutive params", () => {
      const t = topic("/:wardId/:bedId", schema)

      const result = t.build({ wardId: "w1", bedId: "b2" })

      expect(result).toBe("w1/b2")
    })

    it("should return the topic unchanged when there are no params", () => {
      const t = topic("/events", schema)

      const result = t.build()

      expect(result).toBe("events")
    })

    it("should throw MissingParamError when a required param is absent", () => {
      const t = topic("/devices/:deviceId/status", schema)

      expect(() => t.build({} as { deviceId: string })).toThrow(
        MissingParamError
      )
    })
  })

  describe(".extractParams()", () => {
    it("should extract a single param from a concrete MQTT topic", () => {
      const t = topic("/devices/:deviceId/status", schema)

      const params = t.extractParams("devices/abc-123/status")

      expect(params).toEqual({ deviceId: "abc-123" })
    })

    it("should extract multiple params", () => {
      const t = topic("/ward/:wardId/bed/:bedId/event", schema)

      const params = t.extractParams("ward/42/bed/7/event")

      expect(params).toEqual({ wardId: "42", bedId: "7" })
    })

    it("should extract consecutive params", () => {
      const t = topic("/:wardId/:bedId", schema)

      const params = t.extractParams("ward42/bed7")

      expect(params).toEqual({ wardId: "ward42", bedId: "bed7" })
    })

    it("should return an empty object for a topic with no params", () => {
      const t = topic("/events", schema)

      const params = t.extractParams("events")

      expect(params).toEqual({})
    })

    it("should throw TopicPatternMismatchError when the incoming topic does not match the pattern", () => {
      const t = topic("/devices/:deviceId/status", schema)

      expect(() => t.extractParams("devices/abc/telemetry")).toThrow(
        TopicPatternMismatchError
      )
    })
  })
})
