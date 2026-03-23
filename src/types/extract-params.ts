type ExtractParamNames<
  T extends string,
  Acc extends string = never,
> = T extends `${string}/:${infer Param}/${infer Rest}`
  ? ExtractParamNames<Rest, Acc | Param>
  : T extends `${string}/:${infer Param}`
    ? Acc | Param
    : T extends `:${infer Param}/${infer Rest}`
      ? ExtractParamNames<Rest, Acc | Param>
      : T extends `:${infer Param}`
        ? Acc | Param
        : Acc

/** Extracts typed path params from an Express-style path. Returns `never` when there are no params. */
export type ExtractParams<T extends string> = [ExtractParamNames<T>] extends [
  never,
]
  ? never
  : { [K in ExtractParamNames<T>]: string }
