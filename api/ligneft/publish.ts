import { publishNormalizedData } from "../../src/lib/ligneft/archive";
import {
  LigneFtConfigurationError,
  LigneFtGithubError,
  LigneFtValidationError,
} from "../../src/lib/ligneft/errors";
import type {
  LigneFtErrorResponse,
  LigneFtPublishRequestBody,
  LigneFtPublishResponse,
} from "../../src/types/ligneft-api";

function jsonResponse(body: LigneFtPublishResponse | LigneFtErrorResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: LigneFtPublishRequestBody;

    try {
      body = (await request.json()) as LigneFtPublishRequestBody;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid JSON body",
          },
        },
        400,
      );
    }

    if (!body || typeof body !== "object" || !("data" in body)) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: 'Missing required body field: "data"',
          },
        },
        400,
      );
    }

    const diagnostic = await publishNormalizedData(body.data);

    return jsonResponse({
      ok: true,
      diagnostic,
    });
  } catch (error) {
    if (error instanceof LigneFtValidationError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.message,
            details: error.details,
          },
        },
        422,
      );
    }

    if (error instanceof LigneFtConfigurationError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "CONFIGURATION_ERROR",
            message: error.message,
            details: error.details,
          },
        },
        500,
      );
    }

    if (error instanceof LigneFtGithubError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "GITHUB_ERROR",
            message: error.message,
            details: error.details,
          },
        },
        500,
      );
    }

    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown internal error",
        },
      },
      500,
    );
  }
}