/**
 * Extracts the union of param names from a path like '/ward/:wardId/bed/:bedId'
 * → 'wardId' | 'bedId'
 * Tail-recursive — same guarantee as TopicPattern.
 */
export type ExtractParamNames<
  T extends string,
  Acc extends string = never,
> = T extends `${string}/:${infer Param}/${infer Rest}`
  ? ExtractParamNames<Rest, Acc | Param>
  : T extends `${string}/:${infer Param}`
    ? Acc | Param
    : Acc

/**
 * Extracts typed params from a path like '/ward/:wardId/bed/:bedId'
 * → { wardId: string; bedId: string }
 */
export type ExtractParams<T extends string> = {
  [K in ExtractParamNames<T>]: string
}
