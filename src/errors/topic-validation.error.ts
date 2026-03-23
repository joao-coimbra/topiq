import type { z } from "zod"

/** Thrown when an incoming MQTT payload fails Zod schema validation. */
export class TopicValidationError extends Error {
  constructor(
    readonly topic: string,
    override readonly cause: z.ZodError
  ) {
    super(`Payload validation failed for topic "${topic}"`)
    this.name = "TopicValidationError"
  }
}
