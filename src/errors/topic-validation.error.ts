import type { z } from "zod"

/**
 * Thrown when an incoming MQTT payload fails schema validation.
 * The `cause` property holds the full Zod error for inspection.
 */
export class TopicValidationError extends Error {
  constructor(
    /** The path of the topic whose payload failed validation */
    readonly topic: string,
    override readonly cause: z.ZodError
  ) {
    super(`Validation failed for topic "${topic}"`)
  }
}
