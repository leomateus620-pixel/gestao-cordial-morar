export class BotError extends Error {
  constructor(
    public code: string,
    public status = 503,
    public retryAfter = 60,
  ) {
    super(code);
  }
}
