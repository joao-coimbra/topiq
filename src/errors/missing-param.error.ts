/** Thrown when a required path param is missing from a `build()` call. */
export class MissingParamError extends Error {
  constructor(readonly param: string) {
    super(`Missing required param "${param}"`)
    this.name = "MissingParamError"
  }
}
