import { publishLtvCurrentToLogs } from "../../src/lib/ligneft/ltvArchive.js";
import {
  LigneFtConfigurationError,
  LigneFtGithubError,
  LigneFtValidationError,
} from "../../src/lib/ligneft/errors.js";
import type {
  LtvErrorResponse,
  LtvPublishRequestBody,
} from "../../src/types/ltv-api";

type PublishCurrentResponse = {
  ok: true;
  path: string;
  publishedAt: string;
  rowCount: number;
  warnings: string[];
};

function jsonResponse(
  body: PublishCurrentResponse | LtvErrorResponse,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Écrit le fichier LTV canonique unique (lim-logs/ltv-normalized/current.json),
// celui que l'app cabine écrit aussi et que les deux (LIM + éditeur) lisent.
export async function POST(request: Request): Promise<Response> {
  try {
    let body: LtvPublishRequestBody;

    try {
      body = (await request.json()) as LtvPublishRequestBody;
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid JSON body" } },
        400
      );
    }

    if (!body || typeof body !== "object" || !("data" in body)) {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_REQUEST", message: 'Missing required body field: "data"' } },
        400
      );
    }

    const result = await publishLtvCurrentToLogs(body.data);

    return jsonResponse({
      ok: true,
      path: result.path,
      publishedAt: result.publishedAt,
      rowCount: result.rowCount,
      warnings: result.warnings,
    });
  } catch (error) {
    if (error instanceof LigneFtValidationError) {
      return jsonResponse(
        { ok: false, error: { code: "VALIDATION_ERROR", message: error.message, details: error.details } },
        422
      );
    }

    if (error instanceof LigneFtConfigurationError) {
      return jsonResponse(
        { ok: false, error: { code: "CONFIGURATION_ERROR", message: error.message, details: error.details } },
        500
      );
    }

    if (error instanceof LigneFtGithubError) {
      return jsonResponse(
        { ok: false, error: { code: "GITHUB_ERROR", message: error.message, details: error.details } },
        500
      );
    }

    return jsonResponse(
      { ok: false, error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Unknown internal error" } },
      500
    );
  }
}
