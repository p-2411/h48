// An error the server answers with: an HTTP status and a short code the app can act on. The body
// follows OpenAI's error shape, so the app's OpenAI SDK reads it like one of OpenAI's own.
export class HttpError extends Error {
  constructor(status, code, message = code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }

  body() {
    return { error: { type: 'duet', code: this.code, message: this.message, ...this.extra } };
  }
}

export const refuse = (code, message) => new HttpError(400, code, message);
