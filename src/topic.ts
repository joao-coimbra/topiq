import type { ZodType, z } from "zod"
import type { ExtractParamNames } from "@/types/extract-params"
import type { TopicPattern } from "@/types/topic-pattern"
import { TopicPatternMismatchError } from "./errors/topic-pattern-mismatch.error"

const PARAM_WILDCARD = /\/:([^/]+)/g
const LEADING_SLASH = /^\//

/**
 * A typed MQTT topic definition binding a path pattern to a Zod validation schema.
 *
 * @template Pattern - The MQTT wildcard pattern, e.g. `"devices/+/status"`
 * @template Output  - The inferred payload type, e.g. `{ online: boolean; battery: number }`
 * @template Params  - The extracted path params, e.g. `{ deviceId: string }`
 */
export class Topic<
  Pattern extends string,
  Output = unknown,
  Params extends Record<string, string> = Record<string, string>,
> {
  /**
   * The MQTT wildcard pattern derived from the path.
   * Leading slash is removed and path params are replaced with `+`.
   *
   * @example
   * topic("/devices/:deviceId/status", schema).topic
   * // → "devices/+/status"
   */
  readonly topic: Pattern

  /**
   * Extracts typed path parameters from a live MQTT topic string.
   *
   * @param mqttTopic - The concrete MQTT topic received, e.g. `"devices/abc-123/status"`
   * @returns An object with the extracted param values, e.g. `{ deviceId: "abc-123" }`
   * @throws {TopicPatternMismatchError} If the topic does not match the pattern
   *
   * @example
   * const t = topic("/devices/:deviceId/status", schema)
   * try {
   *   t.extractParams("devices/abc-123/status") // → { deviceId: "abc-123" }
   * } catch (error) {
   *   if (error instanceof TopicPatternMismatchError) {
   *     console.error(`Topic "${error.topic}" does not match the pattern "${error.pattern}"`)
   *   }
   * }
   */
  extractParams(mqttTopic: string): Params {
    const paramNames: string[] = []
    const regexStr = this.path
      .replace(LEADING_SLASH, "")
      .replace(PARAM_WILDCARD, (_, name: string) => {
        paramNames.push(name)
        return "/([^/]+)"
      })

    const match = mqttTopic.match(new RegExp(`^${regexStr}$`))
    if (!match) {
      throw new TopicPatternMismatchError(mqttTopic, this.topic)
    }

    return paramNames.reduce(
      (acc, name, i) => {
        acc[name] = match[i + 1] ?? ""
        return acc
      },
      {} as Record<string, string>
    ) as Params
  }

  protected constructor(
    private readonly path: string,
    readonly schema: ZodType<Output>
  ) {
    this.topic = path
      .replace(PARAM_WILDCARD, "/+")
      .replace(LEADING_SLASH, "") as Pattern
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
  ): Topic<
    TopicPattern<Path>,
    z.infer<Schema>,
    { [K in ExtractParamNames<Path>]: string }
  > {
    return new Topic(path, schema) as Topic<
      TopicPattern<Path>,
      z.infer<Schema>,
      { [K in ExtractParamNames<Path>]: string }
    >
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
 * // type: Topic<"devices/+/status", { online: boolean; battery: number }, { deviceId: string }>
 */
export function topic<Path extends string, Schema extends ZodType>(
  path: Path,
  schema: Schema
): Topic<
  TopicPattern<Path>,
  z.infer<Schema>,
  { [K in ExtractParamNames<Path>]: string }
> {
  return Topic.from(path, schema)
}
