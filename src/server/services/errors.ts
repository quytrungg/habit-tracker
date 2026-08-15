export type ServiceErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "UNAUTHENTICATED";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ServiceErrorCode,
    message: string,
    options: { status?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status =
      options.status ??
      (code === "NOT_FOUND"
        ? 404
        : code === "UNAUTHENTICATED"
          ? 401
          : code === "CONFLICT"
            ? 409
            : 400);
    this.details = options.details;
  }
}
