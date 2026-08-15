import { ZodError } from "zod";

import { ServiceError } from "@/server/services/errors";

export function apiError(error: unknown) {
  if (error instanceof ServiceError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body is invalid",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500 },
  );
}

export async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
}
