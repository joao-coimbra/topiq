import type { ExtractParams } from "./extract-params"

/** The event received on subscribe */
export interface TopicEvent<Path extends string, Output> {
  /** Validated and parsed payload */
  readonly payload: Output
  /** Extracted params from the wildcard path */
  readonly params: ExtractParams<Path>
  /** The raw MQTT topic string that triggered this message */
  readonly topic: string
  /** Raw unparsed payload (Buffer or string) */
  readonly raw: Buffer | string
}
