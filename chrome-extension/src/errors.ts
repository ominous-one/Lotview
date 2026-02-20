export enum ErrorCode {
  NETWORK_OFFLINE = "NETWORK_OFFLINE",
  NETWORK_TIMEOUT = "NETWORK_TIMEOUT",
  AUTH_EXPIRED = "AUTH_EXPIRED",
  AUTH_INVALID = "AUTH_INVALID",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "SERVER_ERROR",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  FILL_FAILED = "FILL_FAILED",
  IMAGE_FETCH_FAILED = "IMAGE_FETCH_FAILED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  UNKNOWN = "UNKNOWN",
}

export interface StructuredError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export function createError(code: ErrorCode, message?: string): StructuredError {
  const defaults: Record<ErrorCode, { message: string; retryable: boolean; retryAfterMs?: number }> = {
    [ErrorCode.NETWORK_OFFLINE]: {
      message: "You appear to be offline. Check your internet connection.",
      retryable: true,
      retryAfterMs: 5000,
    },
    [ErrorCode.NETWORK_TIMEOUT]: {
      message: "Request timed out. Please try again.",
      retryable: true,
      retryAfterMs: 3000,
    },
    [ErrorCode.AUTH_EXPIRED]: {
      message: "Your session has expired. Please log in again.",
      retryable: false,
    },
    [ErrorCode.AUTH_INVALID]: {
      message: "Invalid credentials. Please check and try again.",
      retryable: false,
    },
    [ErrorCode.RATE_LIMITED]: {
      message: "Too many requests. Please wait before trying again.",
      retryable: true,
      retryAfterMs: 60000,
    },
    [ErrorCode.SERVER_ERROR]: {
      message: "Server error. Please try again later.",
      retryable: true,
      retryAfterMs: 10000,
    },
    [ErrorCode.VALIDATION_FAILED]: {
      message: "Invalid data received from server.",
      retryable: false,
    },
    [ErrorCode.FILL_FAILED]: {
      message: "Form fill failed. Facebook may have changed their layout.",
      retryable: false,
    },
    [ErrorCode.IMAGE_FETCH_FAILED]: {
      message: "Failed to load vehicle images.",
      retryable: true,
      retryAfterMs: 3000,
    },
    [ErrorCode.PERMISSION_DENIED]: {
      message: "You don't have permission for this action.",
      retryable: false,
    },
    [ErrorCode.UNKNOWN]: {
      message: "An unexpected error occurred.",
      retryable: false,
    },
  };

  const defaultError = defaults[code];
  return {
    code,
    message: message || defaultError.message,
    retryable: defaultError.retryable,
    retryAfterMs: defaultError.retryAfterMs,
  };
}

export function parseHttpError(status: number, body?: string): StructuredError {
  switch (status) {
    case 401:
      return createError(ErrorCode.AUTH_EXPIRED, body);
    case 403:
      return createError(ErrorCode.PERMISSION_DENIED, body);
    case 429:
      return createError(ErrorCode.RATE_LIMITED, body);
    case 500:
    case 502:
    case 503:
    case 504:
      return createError(ErrorCode.SERVER_ERROR, body);
    default:
      return createError(ErrorCode.UNKNOWN, body || `Request failed: ${status}`);
  }
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function isRetryable(error: StructuredError): boolean {
  return error.retryable && isOnline();
}
