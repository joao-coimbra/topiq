/**
 * Extracts typed params from a path like '/ward/:wardId/bed/:bedId'
 * into { wardId: string, bedId: string }
 * Tail-recursive — same guarantee.
 */
export type ExtractParams<
  T extends string,
  Acc extends Record<string, string> = Record<never, string>,
> = T extends `${string}/:${infer Param}/${infer Rest}`
  ? ExtractParams<Rest, Acc & { [K in Param]: string }>
  : T extends `${string}/:${infer Param}`
    ? Acc & { [K in Param]: string }
    : Acc
