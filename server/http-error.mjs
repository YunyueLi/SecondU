export class HttpError extends Error { constructor(status, message, code = 'invalid_request') { super(message); this.status = status; this.code = code; } }
