import mqtt, { type MqttClient as MqttClientType } from "mqtt"
import type { ZodType, z } from "zod"
import {
  TopicPatternMismatchError,
  TopicValidationError,
  UnregisteredTopicError,
} from "./errors"
import type { ConcreteTopic, Topic } from "./topic"

// --- Config ---

/** TLS certificate material for mutual TLS connections */
interface TLSConfig {
  /** PEM-encoded CA certificate */
  ca: string
  /** PEM-encoded client private key */
  key: string
  /** PEM-encoded client certificate */
  cert: string
}

/**
 * Client configuration for the MQTT broker
 * . Provide either a `url` or a `host` (with optional `port` and `protocol`).
 * . Provide a `tls` object to enable TLS with certificate material.
 * . Provide a `username` and `password` to authenticate with the broker.
 * . Provide a `topics` map to register with the client.
 * . Provide a `options` map to configure the client.
 * . Provide a `client` object to configure the client.
 * . Provide a `options` object to configure the client.
 * . Provide a `client` object to configure the client.
 */
type ClientConfig =
  | {
      /** Broker hostname */
      host: string
      /** Defaults to `1883`, or `8883` when `tls` is set */
      port?: number
      /** Defaults to `"mqtt"`, or `"mqtts"` when `tls` is set */
      protocol?: string
      /** Pass `true` to enable MQTT over TLS with default settings, or provide certificate material */
      tls?: true | TLSConfig
      username?: string
      password?: string
    }
  | {
      /** Full broker URL, e.g. `"mqtt://broker.example.com:1883"` */
      url: string
      /** Pass `true` to enable MQTT over TLS with default settings, or provide certificate material */
      tls?: true | TLSConfig
      username?: string
      password?: string
    }

type TopicsMap = Record<string, Topic<string, unknown, ZodType>>

interface TopiqOptions<Topics extends TopicsMap> {
  /** Named map of topic definitions to register with the client */
  topics?: Topics
}

type TopiqConfig<Topics extends TopicsMap> = {
  client: ClientConfig
} & TopiqOptions<Topics>

// --- Types ---

type RawMessageHandler = (topic: string, payload: Buffer) => void

type PatternOf<Topics extends TopicsMap> = Topics[keyof Topics]["topic"]

type TopicByPattern<
  Topics extends TopicsMap,
  MQTTPattern extends string,
> = Extract<Topics[keyof Topics], { readonly topic: MQTTPattern }>

type InferPayload<Subject extends Topic<string, unknown, ZodType>> =
  Subject extends Topic<string, unknown, infer TSchema extends ZodType>
    ? z.infer<TSchema>
    : never

type InferParams<Subject extends Topic<string, unknown, ZodType>> =
  Subject extends Topic<string, infer TParams, ZodType> ? TParams : never

/** A message yielded by {@link TopiqClient["stream"]} */
export interface StreamMessage<T> {
  /** The raw MQTT topic string that delivered this message */
  topic: string
  /** The validated payload, typed according to the topic's schema */
  data: T
}

// --- Client ---

export class TopiqClient<Topics extends TopicsMap> {
  private readonly client: MqttClientType
  private readonly topicsMap = new Map<
    string,
    Topic<string, unknown, ZodType>
  >()
  private readonly handlers = new Set<RawMessageHandler>()
  private readonly subscriptions = new Set<string>()

  get isConnected(): boolean {
    return this.client.connected
  }

  protected constructor(private readonly config: TopiqConfig<Topics>) {
    this.client = this.connect()
    this.listen()

    if (config.topics) {
      for (const topic of Object.values(config.topics)) {
        this.topicsMap.set(topic.topic, topic)
      }
    }
  }

  static from<Topics extends TopicsMap>(
    config: TopiqConfig<Topics>
  ): TopiqClient<Topics> {
    return new TopiqClient(config)
  }

  // --- Public API ---

  /**
   * Subscribes to a topic and invokes the callback for each valid incoming message.
   * The MQTT subscription is established lazily on the first call for a given pattern.
   *
   * @param topic - A registered `Topic` instance or its MQTT wildcard pattern string
   * @param callback - Invoked with the validated payload as `data` and a context object
   *   containing the raw `topic` string and the extracted `params` map
   * @returns An unsubscribe function — call it to stop receiving messages
   *
   * @example
   * const off = client.on(deviceStatus, (data, { topic, params }) => {
   *   console.log(data.online)   // typed payload
   *   console.log(params.deviceId) // typed path param
   *   console.log(topic)         // raw MQTT topic string, e.g. "devices/abc/status"
   * })
   * off() // unsubscribe
   */
  on<Pattern extends PatternOf<Topics>>(
    topic: TopicByPattern<Topics, Pattern> | Pattern,
    callback: (
      data: InferPayload<TopicByPattern<Topics, Pattern>>,
      context: {
        topic: ConcreteTopic<Pattern>
        params: InferParams<TopicByPattern<Topics, Pattern>>
      }
    ) => void
  ): () => void {
    const resolved = this.resolve(topic)
    this.ensureSubscribed(resolved.topic)

    const handler: RawMessageHandler = (incomingTopic, payload) => {
      try {
        const data = this.parse(resolved, incomingTopic, payload)
        callback(data as InferPayload<TopicByPattern<Topics, Pattern>>, {
          topic: incomingTopic as ConcreteTopic<Pattern>,
          params: resolved.extractParams(incomingTopic) as InferParams<
            TopicByPattern<Topics, Pattern>
          >,
        })
      } catch {
        // TODO: expose an onError hook so callers can handle validation/pattern
        // errors without crashing the process (e.g. dead-letter queue, metrics).
      }
    }

    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /**
   * Publishes a validated payload to the given topic.
   * The payload is serialized as JSON before sending.
   *
   * @param topic - A registered `Topic` instance or its MQTT wildcard pattern string
   * @param data - The payload to publish — must match the topic's schema type
   *
   * @example
   * client.emit(deviceStatus.build({ deviceId: "abc" }), { online: true, battery: 87 })
   */
  emit<Pattern extends PatternOf<Topics>>(
    topic: ConcreteTopic<Pattern>,
    data: InferPayload<TopicByPattern<Topics, Pattern>>
  ): void {
    this.client.publish(topic, JSON.stringify(data))
  }

  /**
   * Returns an async iterable that yields validated messages as they arrive.
   * Messages are buffered internally so no message is dropped between iterations.
   *
   * Each yielded value is a `{ data, topic }` object where `data` is the validated
   * payload and `topic` is the raw MQTT topic string that delivered the message.
   *
   * @param topic - A registered `Topic` instance or its MQTT wildcard pattern string
   * @param signal - Optional `AbortSignal` to terminate the stream early
   * @returns An async iterable of `{ data, topic }` objects
   *
   * @example
   * const controller = new AbortController()
   *
   * for await (const { data, topic } of client.stream(telemetry, controller.signal)) {
   *   console.log(data.temperature) // typed payload field
   *   console.log(topic)            // raw MQTT topic, e.g. "sensors/42/telemetry"
   * }
   *
   * controller.abort() // stop the stream
   */
  stream<Pattern extends PatternOf<Topics>>(
    topic: TopicByPattern<Topics, Pattern> | Pattern,
    signal?: AbortSignal
  ): AsyncIterable<
    StreamMessage<InferPayload<TopicByPattern<Topics, Pattern>>>
  > {
    const resolved = this.resolve(topic)
    this.ensureSubscribed(resolved.topic)

    type Message = StreamMessage<InferPayload<TopicByPattern<Topics, Pattern>>>

    const queue: Message[] = []
    let resolve: ((r: IteratorResult<Message, undefined>) => void) | null = null

    const cleanup = () => {
      this.handlers.delete(handler)
      signal?.removeEventListener("abort", cleanup)
      resolve?.({ value: undefined, done: true })
      resolve = null
    }

    signal?.addEventListener("abort", cleanup)

    const handler: RawMessageHandler = (incomingTopic, payload) => {
      try {
        const data = this.parse(resolved, incomingTopic, payload)
        const message = {
          topic: incomingTopic,
          data: data as InferPayload<TopicByPattern<Topics, Pattern>>,
        }

        if (resolve) {
          resolve({ value: message, done: false })
          resolve = null
        } else {
          queue.push(message)
        }
      } catch {
        // TODO: expose an onError hook so callers can handle validation/pattern
        // errors without crashing the process (e.g. dead-letter queue, metrics).
      }
    }

    this.handlers.add(handler)

    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<Message, undefined>> =>
          new Promise((res) => {
            if (queue.length > 0) {
              // biome-ignore lint/style/noNonNullAssertion: we know the queue is not empty
              res({ value: queue.shift()!, done: false })
            } else {
              resolve = res
            }
          }),
        return: (): Promise<IteratorResult<Message, undefined>> => {
          cleanup()
          return Promise.resolve({ value: undefined, done: true })
        },
      }),
    }
  }

  /** Closes the underlying MQTT connection. */
  disconnect(): void {
    this.client.end()
  }

  // --- Internals ---

  private resolve<Subject extends Topic<string, unknown, ZodType>>(
    input: Subject | PatternOf<Topics>
  ): Subject {
    if (typeof input !== "string") {
      return input
    }
    const found = this.topicsMap.get(input)
    if (!found) {
      throw new UnregisteredTopicError(input)
    }
    return found as Subject
  }

  private ensureSubscribed(pattern: string): void {
    if (this.subscriptions.has(pattern)) {
      return
    }
    this.subscriptions.add(pattern)
    this.client.subscribe(pattern)
  }

  private matchTopic(pattern: string, incoming: string): boolean {
    const patternParts = pattern.split("/")
    const incomingParts = incoming.split("/")

    if (patternParts.length !== incomingParts.length) {
      return false
    }

    return patternParts.every(
      (part, i) => part === "+" || part === "#" || part === incomingParts[i]
    )
  }

  private parse<Subject extends Topic<string, unknown>>(
    topic: Subject,
    incomingTopic: string,
    payload: Buffer
  ): InferPayload<Subject> {
    if (!this.matchTopic(topic.topic, incomingTopic)) {
      throw new TopicPatternMismatchError(incomingTopic, topic.topic)
    }

    const result = topic.schema.safeParse(this.parseJson(payload))

    if (!result.success) {
      throw new TopicValidationError(topic.topic, result.error)
    }

    return result.data as InferPayload<Subject>
  }

  private connect() {
    const { client } = this.config
    const certificates =
      client.tls && typeof client.tls === "object" ? client.tls : undefined

    return mqtt.connect(this.resolveUrl(), {
      username: client.username,
      password: client.password,
      ...certificates,
    })
  }

  private listen() {
    this.client.on("message", (topic, payload) => {
      for (const handler of this.handlers) {
        handler(topic, payload)
      }
    })
  }

  private resolveUrl() {
    const { client } = this.config

    if ("url" in client) {
      return client.url
    }

    const {
      host,
      port = client.tls ? 8883 : 1883,
      protocol = client.tls ? "mqtts" : "mqtt",
    } = client

    return `${protocol}://${host}:${port}`
  }

  private parseJson(payload: Buffer): unknown {
    try {
      return JSON.parse(payload.toString())
    } catch {
      return payload.toString()
    }
  }

  ready(timeout = 1000): Promise<void> {
    if (this.isConnected) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.removeListener("connect", onConnect)
        reject(
          new Error(
            `Timeout: Failed to connect to MQTT broker after ${timeout}ms`
          )
        )
      }, timeout)

      const onConnect = () => {
        clearTimeout(timer)
        this.client.removeListener("connect", onConnect)
        resolve()
      }

      this.client.once("connect", onConnect)
    })
  }
}

// --- Factory ---

/**
 * Creates a `TopiqClient` connected to an MQTT broker.
 *
 * @param client - Broker connection config (URL or host/port)
 * @param options - Client options, including the named topics map
 *
 * @example
 * const client = topiq(
 *   { host: "broker.example.com" },
 *   { topics: { deviceStatus, telemetry } }
 * )
 */
export function topiq<Topics extends TopicsMap>(
  client: ClientConfig,
  options: TopiqOptions<Topics>
): TopiqClient<Topics>
/**
 * Creates a `TopiqClient` connected to an MQTT broker.
 *
 * @param config - Combined config object with `client` and `options` keys
 *
 * @example
 * const client = topiq({
 *   client: { url: "mqtt://broker.example.com:1883" },
 *   options: { topics: { deviceStatus } },
 * })
 */
export function topiq<Topics extends TopicsMap>(
  config: TopiqConfig<Topics>
): TopiqClient<Topics>
export function topiq<Topics extends TopicsMap>(
  clientOrConfig: ClientConfig | TopiqConfig<Topics>,
  options: TopiqOptions<Topics> = {}
): TopiqClient<Topics> {
  if ("client" in clientOrConfig) {
    return TopiqClient.from(clientOrConfig)
  }
  return TopiqClient.from({ client: clientOrConfig, ...options })
}
