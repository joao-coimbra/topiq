/**
 * Converts a typed path like '/ward/:wardId/bed/:bedId/event'
 * into a valid MQTT wildcard path: 'ward/+/bed/+/event'
 * Tail-recursive — handles 200+ wildcards without blowing the TS stack.
 */
export type TopicPattern<
  T extends string,
  Acc extends string = "",
> = T extends `${infer Before}/:${infer _Param}/${infer After}`
  ? TopicPattern<After, `${Acc}${Before}/+/`>
  : T extends `${infer Before}/:${infer _Param}`
    ? `${Acc}${Before}/+`
    : `${Acc}${T}`
