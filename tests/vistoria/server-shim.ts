export const useServerFn = <T>(fn: T): T => fn;
export const createServerFn = () => ({
  middleware() {
    return this;
  },
  inputValidator() {
    return this;
  },
  handler(fn: unknown) {
    return fn;
  },
});
export const createMiddleware = () => ({
  server() {
    return this;
  },
  client() {
    return this;
  },
});
