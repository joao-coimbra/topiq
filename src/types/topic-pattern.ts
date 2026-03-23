type BuildTopicPattern<
  T extends string,
  Acc extends string = "",
> = T extends `:${infer _}/${infer After}`
  ? BuildTopicPattern<After, `${Acc}+/`>
  : T extends `:${infer _}`
    ? `${Acc}+`
    : T extends `${infer Before}/${infer After}`
      ? BuildTopicPattern<After, `${Acc}${Before}/`>
      : `${Acc}${T}`

/** Converts an Express-style path to an MQTT wildcard pattern string. */
export type TopicPattern<T extends string> = BuildTopicPattern<
  T extends `/${infer Rest}` ? Rest : T
>
