/** Thrown when an incoming MQTT topic does not match the registered pattern. */
export class TopicPatternMismatchError extends Error {
  constructor(
    readonly topic: string,
    readonly pattern: string
  ) {
    super(`Topic "${topic}" does not match pattern "${pattern}"`)
    this.name = "TopicPatternMismatchError"
  }
}
