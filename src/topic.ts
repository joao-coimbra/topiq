import type { ZodType, z } from "zod"
import type { TopicPattern } from "@/types/topic-pattern"
import { TopicValidationError } from "./errors/topic-validation.error"
import type { ExtractParams } from "./types/extract-params"

const PARAM_WILDCARD = /\/:([^/]+)/g
const LEADING_SLASH = /^\//

/**
 * A typed MQTT topic definition binding a path pattern to a Zod validation schema.
 *
 * @template Path - The Express-style path string, e.g. `"/devices/:deviceId/status"`
 * @template Schema - The Zod schema used to validate incoming payloads
 */
export class Topic<Path extends string, Schema extends ZodType> {
  /** The original Express-style path, e.g. `"/devices/:deviceId/status"` */
  readonly path: Path

  /** The Zod schema used to validate payloads for this topic */
  readonly schema: Schema

  /**
   * The MQTT wildcard pattern derived from the path.
   * Leading slash is removed and path params are replaced with `+`.
   *
   * @example
   * topic("/devices/:deviceId/status", schema).topic
   * // → "devices/+/status"
   */
  get topic(): TopicPattern<Path> {
    return this.path
      .replace(PARAM_WILDCARD, "/+")
      .replace(LEADING_SLASH, "") as TopicPattern<Path>
  }

  /**
   * Extracts typed path parameters from a live MQTT topic string.
   *
   * @param mqttTopic - The concrete MQTT topic received, e.g. `"devices/abc-123/status"`
   * @returns An object with the extracted param values, e.g. `{ deviceId: "abc-123" }`
   *          Returns an empty object if the topic does not match the pattern.
   *
   * @example
   * const t = topic("/devices/:deviceId/status", schema)
   * t.extractParams("devices/abc-123/status") // → { deviceId: "abc-123" }
   */
  extractParams(mqttTopic: string): ExtractParams<Path> {
    const paramNames: string[] = []
    const regexStr = this.path
      .replace(LEADING_SLASH, "")
      .replace(PARAM_WILDCARD, (_, name) => {
        paramNames.push(name)
        return "/([^/]+)"
      })

    const match = mqttTopic.match(new RegExp(`^${regexStr}$`))
    if (!match) {
      return {} as ExtractParams<Path>
    }

    return paramNames.reduce(
      (acc, name, i) => {
        acc[name] = match[i + 1] ?? ""
        return acc
      },
      {} as Record<string, string>
    ) as ExtractParams<Path>
  }

  protected constructor(path: Path, schema: Schema) {
    this.path = path
    this.schema = schema
  }

  /**
   * Creates a new `Topic` instance.
   *
   * @param path - Express-style path pattern, e.g. `"/devices/:deviceId/status"`
   * @param schema - Zod schema to validate payloads against
   */
  static from<Path extends string, Schema extends ZodType>(
    path: Path,
    schema: Schema
  ): Topic<Path, Schema> {
    return new Topic(path, schema)
  }

  /**
   * Validates and parses a raw payload against this topic's schema.
   *
   * @param data - The raw value to validate (typically parsed JSON)
   * @returns The validated payload typed as the schema output
   * @throws {TopicValidationError} If the payload does not satisfy the schema
   */
  parse(data: unknown): z.infer<Schema> {
    const result = this.schema.safeParse(data)

    if (!result.success) {
      throw new TopicValidationError(this.path, result.error)
    }

    return result.data
  }
}

/**
 * Creates a typed MQTT topic definition.
 *
 * @param path - Express-style path pattern, e.g. `"/devices/:deviceId/status"`
 * @param schema - Zod schema to validate incoming payloads
 * @returns A `Topic` instance bound to the given path and schema
 *
 * @example
 * const deviceStatus = topic("/devices/:deviceId/status", z.object({
 *   online: z.boolean(),
 *   battery: z.number(),
 * }))
 */
export function topic<Path extends string, Schema extends ZodType>(
  path: Path,
  schema: Schema
): Topic<Path, Schema> {
  return Topic.from(path, schema)
}
