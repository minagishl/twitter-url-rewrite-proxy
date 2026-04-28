import type { RewriteRule } from "../config/rules";
import { rewriteTextContent, rewriteUnknownValue } from "./url-rewriter";

function normalizeContentType(contentType: string | null): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isTextLikeContentType(contentType: string): boolean {
  return (
    contentType.startsWith("text/") ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml") ||
    contentType.includes("javascript") ||
    contentType.includes("xml")
  );
}

export function rewriteByContentType(
  bodyText: string,
  contentTypeHeader: string | null,
  rules: RewriteRule[],
): string {
  const contentType = normalizeContentType(contentTypeHeader);

  if (!contentType || contentType === "text/plain" || contentType === "text/html") {
    return rewriteTextContent(bodyText, rules);
  }

  if (contentType === "application/json" || contentType.endsWith("+json")) {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      return JSON.stringify(rewriteUnknownValue(parsed, rules));
    } catch {
      return rewriteTextContent(bodyText, rules);
    }
  }

  if (contentType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(bodyText);

    for (const [key, value] of params.entries()) {
      params.set(key, rewriteTextContent(value, rules));
    }

    return params.toString();
  }

  if (isTextLikeContentType(contentType)) {
    return rewriteTextContent(bodyText, rules);
  }

  return bodyText;
}

export function shouldRewriteResponseBody(contentTypeHeader: string | null): boolean {
  const contentType = normalizeContentType(contentTypeHeader);

  if (!contentType) {
    return true;
  }

  return (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/x-www-form-urlencoded" ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml") ||
    contentType.includes("javascript") ||
    contentType.includes("xml")
  );
}
