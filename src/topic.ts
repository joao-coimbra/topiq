import type { ZodType } from "zod"
import { MissingParamError, TopicPatternMismatchError } from "./errors"
import type { TopicPattern } from "./types"

const PARAM_WILDCARD = /\/:([^/]+)/g
const LEADING_SLASH = /^\//

// --- Internal type utilities ---

type ExtractParamNames<
  T extends string,
  Acc extends string = never,
> = T extends `${string}:${infer P}/${infer Rest}`
  ? ExtractParamNames<Rest, Acc | P>
  : T extends `${string}:${infer P}`
    ? Acc | P
    : Acc

type StripLeadingSlash<T extends string> = T extends `/${infer R}` ? R : T

type BuildParams<Path extends string> = [ExtractParamNames<Path>] extends [
  never,
]
  ? never
  : Params<{ [K in ExtractParamNames<Path>]: string }>

type BuildConcrete<
  Path extends string,
  P extends Record<string, string>,
> = Path extends `/${infer R}`
  ? BuildConcrete<R, P>
  : Path extends `:${infer K}/${infer B}`
    ? BuildConcrete<`${K extends keyof P ? P[K] : string}/${B}`, P>
    : Path extends `:${infer K}`
      ? K extends keyof P
        ? P[K]
        : string
      : Path extends `${infer A}/:${infer K}/${infer B}`
        ? BuildConcrete<`${A}/${K extends keyof P ? P[K] : string}/${B}`, P>
        : Path extends `${infer A}/:${infer K}`
          ? `${A}/${K extends keyof P ? P[K] : string}`
          : Path

// --- Public types ---

/** Branded path params extracted from an MQTT topic string. */
export type Params<T extends Record<string, string>> = T & {
  readonly __brand: "Params"
}

/** Converts an MQTT wildcard pattern (`+`) to a concrete template literal type. */
export type ConcreteTopic<T extends string> = T extends `${infer A}+${infer B}`
  ? ConcreteTopic<`${A}${string}${B}`>
  : T

// --- Topic class ---

/**
 * A typed MQTT topic binding an Express-style path to a Zod schema.
 *
 * @template TPath   - The path without leading slash, e.g. `"devices/:deviceId/status"`
 * @template TParams - Branded path params, e.g. `Params<{ deviceId: string }>`
 * @template TSchema - The Zod schema type
 */
export class Topic<
  TPath extends string,
  TParams = never,
  TSchema extends ZodType = ZodType,
> {
  /** MQTT wildcard pattern derived from the path, e.g. `"devices/+/status"`. */
  readonly topic: TopicPattern<TPath>

  /** Zod schema used to validate incoming payloads. */
  readonly schema: TSchema

  /**
   * Extracts path params from a concrete MQTT topic string.
   *
   * @throws {TopicPatternMismatchError} If the topic does not match the pattern.
   *
   * @example
   * t.extractParams("devices/abc-123/status") // → { deviceId: "abc-123" }
   */
  extractParams(
    mqttTopic: string
  ): [TParams] extends [never]
    ? Record<string, never>
    : { [K in keyof TParams as K extends "__brand" ? never : K]: TParams[K] } {
    const paramNames: string[] = []
    const regexStr = this.path
      .replace(PARAM_WILDCARD, (_, name: string) => {
        paramNames.push(name)
        return "/([^/]+)"
      })
      .replace(LEADING_SLASH, "")

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
    ) as ReturnType<typeof this.extractParams>
  }

  /**
   * Builds a concrete MQTT topic string by substituting path params.
   *
   * @throws {MissingParamError} If any required param is missing.
   *
   * @example
   * t.build({ deviceId: "abc-123" }) // → "devices/abc-123/status"
   */
  build<const T extends Omit<TParams, "__brand">>(
    ...args: [TParams] extends [never] ? [] : [params: T]
  ): BuildConcrete<TPath, T & Record<string, string>> {
    const params = args[0]
    if (!params) {
      return this.topic as BuildConcrete<TPath, T & Record<string, string>>
    }

    const paramNames = [
      ...this.path.matchAll(new RegExp(PARAM_WILDCARD.source, "g")),
    ].map(([, name]) => name as string)

    const p = params as Record<string, string>
    for (const name of paramNames) {
      if (p[name] === undefined) {
        throw new MissingParamError(name)
      }
    }

    return this.path
      .replace(PARAM_WILDCARD, (_, name: string) => `/${p[name]}`)
      .replace(LEADING_SLASH, "") as BuildConcrete<
      TPath,
      T & Record<string, string>
    >
  }

  protected constructor(
    private readonly path: string,
    schema: TSchema
  ) {
    this.schema = schema
    this.topic = path
      .replace(PARAM_WILDCARD, "/+")
      .replace(LEADING_SLASH, "") as TopicPattern<TPath>
  }

  static from<Path extends string, TSchema extends ZodType>(
    path: Path,
    schema: TSchema
  ): Topic<StripLeadingSlash<Path>, BuildParams<Path>, TSchema> {
    return new Topic(path, schema) as Topic<
      StripLeadingSlash<Path>,
      BuildParams<Path>,
      TSchema
    >
  }
}

/**
 * Creates a typed MQTT topic definition.
 *
 * @param path - Express-style path, e.g. `"/devices/:deviceId/status"`
 * @param schema - Zod schema to validate incoming payloads
 *
 * @example
 * const deviceStatus = topic("/devices/:deviceId/status", z.object({
 *   online: z.boolean(),
 *   battery: z.number(),
 * }))
 */
export function topic<Path extends string, TSchema extends ZodType>(
  path: Path,
  schema: TSchema
): Topic<StripLeadingSlash<Path>, BuildParams<Path>, TSchema> {
  return Topic.from(path, schema)
}
