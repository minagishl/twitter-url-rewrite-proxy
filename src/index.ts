import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";
import { builtInRules, loadRules, ruleEnvNames } from "./config/rules";
import { rewriteFetchedResponse } from "./services/fetch-rewriter";

const rules = loadRules();
const appName = "twitter-url-rewrite-proxy";
const appVersion = "0.1.0";

type ConvertRequestBody = {
  url?: string;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const convertJsonBodySchema = t.Object({
  url: t.String({
    description: "The upstream URL to fetch and rewrite.",
    examples: ["https://x.com/jack/status/20"],
  }),
});

const errorResponseSchema = t.Object({
  error: t.String(),
});

const rewriteSuccessResponseSchema = t.Any({
  description:
    "Proxied upstream response body. The exact schema depends on the upstream Content-Type.",
});

const rewriteQuerySchema = t.Object({
  url: t.String({
    description: "The remote URL to fetch and rewrite.",
    examples: ["https://example.com"],
  }),
  rewriteHeaders: t.Optional(
    t.String({
      description: "Set to true or 1 to also rewrite supported response headers.",
      examples: ["true"],
    }),
  ),
});

function readBooleanFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function normalizeContentType(value: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

async function readRequestBody(request: Request): Promise<string> {
  return await request.text();
}

async function parseRewriteInput(request: Request, parsedBody: unknown): Promise<string> {
  const requestUrl = new URL(request.url);
  const queryUrl = requestUrl.searchParams.get("url");

  if (queryUrl) {
    return queryUrl.trim();
  }

  const contentType = normalizeContentType(request.headers.get("content-type"));

  if (contentType === "application/x-www-form-urlencoded") {
    const bodyText = await readRequestBody(request);
    const form = new URLSearchParams(bodyText);
    return form.get("url")?.trim() ?? "";
  }

  if (contentType === "text/plain") {
    return (await readRequestBody(request)).trim();
  }

  if (contentType && contentType !== "application/json") {
    throw new HttpError(
      "Unsupported Content-Type. Use application/json, text/plain, application/x-www-form-urlencoded, or provide ?url=...",
      415,
    );
  }

  if (parsedBody === undefined || parsedBody === null) {
    return "";
  }

  if (typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    throw new HttpError(
      'Invalid JSON body. Expected a JSON object like { "url": "https://example.com" }.',
      400,
    );
  }

  const body = parsedBody as ConvertRequestBody;
  return body.url?.trim() ?? "";
}

function ensureUrl(value: string): string {
  if (!value) {
    throw new HttpError("A non-empty url value is required.", 400);
  }

  try {
    const parsed = new URL(value);
    return parsed.toString();
  } catch {
    throw new HttpError("The url value must be a valid absolute URL.", 400);
  }
}

function toErrorResponse(error: unknown): {
  status: number;
  body: { error: string };
} {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: { error: error.message },
    };
  }

  return {
    status: 400,
    body: {
      error: error instanceof Error ? error.message : "Invalid request.",
    },
  };
}

const app = new Elysia()
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: {
          title: "Twitter URL Rewrite Proxy",
          version: appVersion,
          description:
            "API for fetching upstream content and rewriting URLs based on configured hostname replacement rules.",
        },
        tags: [
          {
            name: "Rewrite Proxy",
            description: "Endpoints for rewriting fetched URLs and responses.",
          },
        ],
      },
    }),
  )
  .get(
    "/",
    () => ({
      name: appName,
      endpoints: ["/rewrite", "/openapi"],
      builtInRules,
      rules,
      env: ruleEnvNames,
    }),
    {
      detail: {
        hide: true,
      },
    },
  )
  .get(
    "/rewrite",
    async ({ request, set }) => {
      try {
        const requestUrl = new URL(request.url);
        const targetUrl = ensureUrl(requestUrl.searchParams.get("url")?.trim() ?? "");
        return await rewriteFetchedResponse({
          url: targetUrl,
          rules,
          rewriteHeadersEnabled: readBooleanFlag(
            requestUrl.searchParams.get("rewriteHeaders") ?? undefined,
          ),
        });
      } catch (error) {
        const response = toErrorResponse(error);
        set.status = response.status;
        return response.body;
      }
    },
    {
      query: rewriteQuerySchema,
      response: {
        200: rewriteSuccessResponseSchema,
        400: errorResponseSchema,
        415: errorResponseSchema,
      },
      detail: {
        tags: ["Rewrite Proxy"],
        summary: "Rewrite a fetched response",
        description:
          "Fetches the target URL from the url query parameter, rewrites supported absolute URLs in the upstream response body based on the configured host rules, and returns the transformed response. Set rewriteHeaders=true to also rewrite supported response headers.",
      },
    },
  )
  .post(
    "/rewrite",
    async ({ request, set, body }) => {
      try {
        const requestUrl = new URL(request.url);
        const targetUrl = ensureUrl(await parseRewriteInput(request, body));
        return await rewriteFetchedResponse({
          url: targetUrl,
          rules,
          rewriteHeadersEnabled: readBooleanFlag(
            requestUrl.searchParams.get("rewriteHeaders") ?? undefined,
          ),
        });
      } catch (error) {
        const response = toErrorResponse(error);
        set.status = response.status;
        return response.body;
      }
    },
    {
      body: t.Optional(convertJsonBodySchema),
      response: {
        200: rewriteSuccessResponseSchema,
        400: errorResponseSchema,
        415: errorResponseSchema,
      },
      detail: {
        tags: ["Rewrite Proxy"],
        summary: "Rewrite a fetched response via POST",
        description:
          "Fetches and rewrites a remote URL provided in the request. Runtime parsing depends on Content-Type: application/json expects { url }, text/plain expects the raw URL, application/x-www-form-urlencoded expects a url field, and ?url=... can be used as a fallback. Other media types return 415.",
      },
    },
  );

const port = Number(Bun.env.PORT ?? 3000);

app.listen(port);

console.log(`Rewrite proxy server listening on http://localhost:${port}`);
