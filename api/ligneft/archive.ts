import { loadArchive } from "../../src/lib/ligneft/archive.js";
import {
  LigneFtArchiveNotFoundError,
  LigneFtConfigurationError,
  LigneFtGithubError,
  LigneFtValidationError,
} from "../../src/lib/ligneft/errors.js";
import type {
  LigneFtArchiveResponse,
  LigneFtErrorResponse,
} from "../../src/types/ligneft-api";

function jsonResponse(body: LigneFtArchiveResponse | LigneFtErrorResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");

    if (!name || name.trim() === "") {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: 'Missing required query parameter: "name"',
          },
        },
        400,
      );
    }

    const archive = await loadArchive(name);

    return jsonResponse({
      ok: true,
      archive: {
        name: archive.name,
        content: archive.content,
        data: archive.data,
      },
    });
  } catch (error) {
    if (error instanceof LigneFtArchiveNotFoundError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "ARCHIVE_NOT_FOUND",
            message: error.message,
            details: {
              archiveName: error.archiveName,
            },
          },
        },
        404,
      );
    }

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