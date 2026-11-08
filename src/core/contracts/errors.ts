// Error contract (ADR 0003 §5.4): errors are values on the event stream, not exceptions
// thrown across module boundaries.

export type BpErrorCode =
  | "NO_MEDIA" | "ACTIVATION_REQUIRED" | "NOT_TOP_LEVEL" | "WINDOW_REFUSED"
  | "ELEMENT_LOST" | "ADAPTER_FAILED" | "ADAPTER_TIMEOUT" | "HELPER_UNAVAILABLE"
  | "PERMISSION_DENIED" | "STORAGE_MIGRATION_FAILED" | "INVALID_MESSAGE";

export interface BpError {
  code: BpErrorCode;
  message: string;
  recoverable: boolean;
  cause?: string;
}

export const bpError = (code: BpErrorCode, message: string, recoverable = true, cause?: unknown): BpError => ({
  code,
  message,
  recoverable,
  ...(cause === undefined ? {} : { cause: String((cause as Error)?.message ?? cause).slice(0, 300) }),
});
