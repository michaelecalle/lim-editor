import { listArchives } from "../../src/lib/ligneft/archive";
import type {
  LigneFtArchivesResponse,
  LigneFtErrorResponse,
} from "../../src/types/ligneft-api";
import { LigneFtConfigurationError, LigneFtGithubError } from "../../src/lib/ligneft/errors";

function jsonResponse(body: LigneFtArchivesResponse | LigneFtErrorResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(): Promise<Response> {
  try {
    const archives = await listArchives();

    return jsonResponse({
      ok: true,
      archives,
    });
  } catch (error) {
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