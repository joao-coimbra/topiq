/**
 * Internal recursive builder — processes a path that has already had its
 * leading slash removed.
 */
type BuildTopicPattern<
  T extends string,
  Acc extends string = "",
> = T extends `${infer Before}/:${infer _Param}/${infer After}`
  ? BuildTopicPattern<After, `${Acc}${Before}/+/`>
  : T extends `${infer Before}/:${infer _Param}`
    ? `${Acc}${Before}/+`
    : `${Acc}${T}`

/**
 * Converts a typed path like '/ward/:wardId/bed/:bedId/event'
 * into a valid MQTT wildcard path: 'ward/+/bed/+/event'
 * Leading slash is stripped automatically.
 * Tail-recursive — handles 200+ wildcards without blowing the TS stack.
 */
export type TopicPattern<T extends string> = BuildTopicPattern<
  T extends `/${infer Rest}` ? Rest : T
>
