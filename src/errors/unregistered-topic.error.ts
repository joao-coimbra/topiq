/** Thrown when a topic pattern is not registered with the client. */
export class UnregisteredTopicError extends Error {
  constructor(readonly pattern: string) {
    super(`Topic "${pattern}" is not registered`)
    this.name = "UnregisteredTopicError"
  }
}
