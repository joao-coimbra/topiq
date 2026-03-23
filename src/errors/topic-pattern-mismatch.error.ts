import type { TopicPattern } from ".."

/**
 * Thrown when an incoming MQTT topic doesn't match the pattern.
 */
export class TopicPatternMismatchError extends Error {
  constructor(
    /** The topic that didn't match the pattern */
    readonly topic: string,
    /** The pattern that the topic didn't match */
    readonly pattern: TopicPattern<string>
  ) {
    super(`Topic "${topic}" does not match the pattern "${pattern}"`)
  }
}
