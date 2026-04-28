import type { RewriteRule } from "../config/rules";
import { rewriteByContentType, shouldRewriteResponseBody } from "./content-transformer";
import { rewriteTextContent } from "./url-rewriter";

function shouldRewriteHeader(name: string): boolean {
  return ["location", "link", "content-location", "refresh"].includes(name.toLowerCase());
}

function rewriteHeaders(headers: Headers, rules: RewriteRule[]): Headers {
  const nextHeaders = new Headers(headers);

  for (const [name, value] of headers.entries()) {
    if (!shouldRewriteHeader(name)) {
      continue;
    }

    nextHeaders.set(name, rewriteTextContent(value, rules));
  }

  return nextHeaders;
}

export async function rewriteFetchedResponse(params: {
  url: string;
  rules: RewriteRule[];
  rewriteHeadersEnabled: boolean;
}): Promise<Response> {
  const upstreamResponse = await fetch(params.url);
  const contentType = upstreamResponse.headers.get("content-type");
  const headers = params.rewriteHeadersEnabled
    ? rewriteHeaders(upstreamResponse.headers, params.rules)
    : new Headers(upstreamResponse.headers);

  headers.delete("content-length");

  if (!shouldRewriteResponseBody(contentType)) {
    const binaryBody = await upstreamResponse.arrayBuffer();

    return new Response(binaryBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  }

  const textBody = await upstreamResponse.text();
  const rewrittenBody = rewriteByContentType(textBody, contentType, params.rules);

  return new Response(rewrittenBody, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}
