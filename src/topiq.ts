import mqtt, { type MqttClient as MqttClientType } from "mqtt"
import type { ZodType } from "zod"
import type { Topic } from "./topic"

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

/** Connect to a broker using a full URL, e.g. `"mqtt://broker.example.com:1883"` */
interface UrlConfig {
  url: string
}

/** Connect to a broker by hostname and optional port/protocol */
interface HostConfig {
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

/**
 * Connection configuration for the MQTT broker.
 * Provide either a `url` or a `host` (with optional `port` and `protocol`).
 */
type ClientConfig = (UrlConfig | HostConfig) & {
  /** Pass `true` to enable MQTT over TLS with default settings, or provide certificate material */
  tls?: true | TLSConfig
  username?: string
  password?: string
}

type TopicsMap = Record<string, Topic<string, ZodType>>

interface TopiqOptions<Topics extends TopicsMap> {
  /** Named map of topic definitions to register with the client */
  topics?: Topics
}

interface TopiqConfig<Topics extends TopicsMap> {
  client: ClientConfig
  options: TopiqOptions<Topics>
}

// --- Types ---

type RawMessageHandler = (topic: string, payload: Buffer) => void

type PatternOf<Topics extends TopicsMap> = Topics[keyof Topics]["topic"]

type TopicByPattern<Topics extends TopicsMap, Pattern extends string> = Extract<
  Topics[keyof Topics],
  Topic<Pattern, ZodType>
>

type InferPayload<Subject extends Topic<string, ZodType>> =
  Subject extends Topic<string, infer Schema extends ZodType>
    ? Schema["_output"]
    : never

/** A message yielded by {@link TopiqClient.stream} */
export interface StreamMessage<T> {
  /** The raw MQTT topic string that delivered this message */
  topic: string
  /** The validated payload, typed according to the topic's schema */
  data: T
}

// --- Client ---

class TopiqClient<Topics extends TopicsMap> {
  private readonly client: MqttClientType
  private readonly topicsMap = new Map<string, Topic<string, ZodType>>()
  private readonly handlers = new Set<RawMessageHandler>()
  private readonly subscriptions = new Set<string>()

  protected constructor(private readonly config: TopiqConfig<Topics>) {
    this.client = this.connect()
    this.listen()

    for (const topic of Object.values(config.options.topics ?? {})) {
      this.topicsMap.set(topic.topic, topic)
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
   * @param callback - Called with the validated payload and the raw MQTT topic string
   * @returns An unsubscribe function — call it to stop receiving messages
   *
   * @example
   * const off = client.on(deviceStatus, (data, rawTopic) => {
   *   console.log(data.online, rawTopic)
   * })
   * off() // unsubscribe
   */
  on<Pattern extends PatternOf<Topics>>(
    topic: TopicByPattern<Topics, Pattern> | Pattern,
    callback: (
      data: InferPayload<TopicByPattern<Topics, Pattern>>,
      topic: string
    ) => void
  ): () => void {
    const resolved = this.resolve(topic)
    this.ensureSubscribed(resolved.topic)

    const handler: RawMessageHandler = (incomingTopic, payload) => {
      const data = this.parse(resolved, incomingTopic, payload)
      if (data !== null) {
        callback(
          data as InferPayload<TopicByPattern<Topics, Pattern>>,
          incomingTopic
        )
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
   * @param data - The payload to publish, typed according to the topic's schema
   *
   * @example
   * client.emit(deviceStatus, { online: true, battery: 87 })
   */
  emit<Pattern extends PatternOf<Topics>>(
    topic: TopicByPattern<Topics, Pattern> | Pattern,
    data: InferPayload<TopicByPattern<Topics, Pattern>>
  ): void {
    const resolved = this.resolve(topic)
    this.client.publish(resolved.topic, JSON.stringify(data))
  }

  /**
   * Returns an async iterable that yields validated messages as they arrive.
   * Messages are buffered internally so no message is lost between iterations.
   *
   * @param topic - A registered `Topic` instance or its MQTT wildcard pattern string
   * @param signal - Optional `AbortSignal` to terminate the stream early
   * @returns An async iterable of `{ data, topic }` objects
   *
   * @example
   * const controller = new AbortController()
   *
   * for await (const { data, topic } of client.stream(telemetry, controller.signal)) {
   *   console.log(data.temperature)
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
      const data = this.parse(resolved, incomingTopic, payload)
      if (data === null) {
        return
      }

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

  private resolve<Subject extends Topic<string, ZodType>>(
    input: Subject | string
  ): Subject {
    if (typeof input !== "string") {
      return input
    }
    const found = this.topicsMap.get(input)
    if (!found) {
      throw new Error(`Topic "${input}" not registered`)
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

  private parse<Subject extends Topic<string, ZodType>>(
    topic: Subject,
    incomingTopic: string,
    payload: Buffer
  ): InferPayload<Subject> | null {
    if (!this.matchTopic(topic.topic, incomingTopic)) {
      return null
    }
    const result = topic.schema.safeParse(this.parseJson(payload))
    return result.success ? (result.data as InferPayload<Subject>) : null
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
    this.client.on("connect", () => console.log("[topiq] connected"))
    this.client.on("disconnect", (err) =>
      console.error("[topiq] disconnected", err)
    )
    this.client.on("reconnect", () => console.log("[topiq] reconnecting..."))
    this.client.on("error", (err) => console.error("[topiq] error", err))
    this.client.on("close", () => console.log("[topiq] connection closed"))
    this.client.on("offline", () => console.log("[topiq] offline"))
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
  return TopiqClient.from({ client: clientOrConfig, options })
}
