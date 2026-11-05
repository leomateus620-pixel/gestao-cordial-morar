/** Preview-only transport selection. The real public loaders read the real, proxied API. */
export function createIsomorphicFn() {
  return {
    server() {
      return this;
    },
    client<T>(fn: T) {
      return fn;
    },
  };
}
