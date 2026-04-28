# Twitter URL Rewrite Proxy

A Bun + TypeScript + Elysia service that fetches an upstream URL, rewrites matching hostnames in the response, and returns the transformed content.

## Features

- Built-in rewrite rules managed in TypeScript.
- Additional rewrite rules loaded from environment variables.
- A single `/rewrite` API for fetch-and-rewrite behavior.
- Request parsing that changes by request `Content-Type`.
- Response transformation that changes by upstream response `Content-Type`.
- OpenAPI documentation served by Elysia.

## Requirements

- Bun 1.3 or later

## Installation

```bash
bun install
```

## Rule Configuration

Built-in rules are defined in `src/config/rules.ts` through the exported `builtInRules` array:

```ts
export const builtInRules = [
  { from: "x.com", to: "fixupx.com" },
  { from: "twitter.com", to: "fxtwitter.com" },
];
```

Environment variables can add more rules at startup:

- `REWRITE_RULES_JSON`: JSON string using the shape `{ "rules": [{ "from": "...", "to": "..." }] }`
- `REWRITE_RULES`: comma-separated `from:to` pairs
- `PORT`: server port, defaults to `3000`

Example:

```bash
export REWRITE_RULES_JSON='{"rules":[{"from":"vxtwitter.com","to":"fixvx.com"}]}'
export REWRITE_RULES='mobile.twitter.com:fxtwitter.com,fixvx.com:fixupx.com'
```

The service normalizes hosts to lowercase, validates them, and deduplicates rules by the `from` hostname. If the same `from` host is defined multiple times, the last normalized entry wins.

## Running the Server

Development mode:

```bash
bun run dev
```

Single run:

```bash
bun run start
```

## API Documentation

OpenAPI UI:

```text
http://localhost:3000/openapi
```

Raw OpenAPI JSON:

```text
http://localhost:3000/openapi/json
```

This project uses [`@elysia/openapi`](https://elysiajs.com/plugins/openapi.html).

## API

### `GET /rewrite`

Fetch an upstream URL from the `url` query parameter, rewrite matching absolute URLs in the upstream response body, and return the transformed response.

```bash
curl 'http://localhost:3000/rewrite?url=https%3A%2F%2Fexample.com'
```

To also rewrite selected response headers such as `Location`, set `rewriteHeaders=true`:

```bash
curl 'http://localhost:3000/rewrite?url=https%3A%2F%2Fexample.com&rewriteHeaders=true'
```

### `POST /rewrite`

`POST /rewrite` performs the same fetch-and-rewrite operation, but reads the upstream URL from the request based on the request `Content-Type`:

- `application/json`: expects `{ "url": "https://example.com" }`
- `text/plain`: expects the raw URL as the request body
- `application/x-www-form-urlencoded`: expects a `url` field
- query string fallback: `?url=...`

Unsupported request media types return `415 Unsupported Media Type`.

JSON request example:

```bash
curl -X POST http://localhost:3000/rewrite \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

Plain text request example:

```bash
curl -X POST http://localhost:3000/rewrite \
  -H 'Content-Type: text/plain' \
  --data 'https://example.com'
```

Form request example:

```bash
curl -X POST http://localhost:3000/rewrite \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'url=https%3A%2F%2Fexample.com'
```

Malformed JSON, a missing `url`, or a non-absolute URL return `400` with a JSON error payload:

```json
{
  "error": "A non-empty url value is required."
}
```

## Response Content-Type Handling

The service rewrites upstream response bodies for:

- `text/plain`
- `text/html`
- `application/json`
- `application/x-www-form-urlencoded`
- text-like formats such as `application/*+json`, XML, and JavaScript

Binary or unsupported upstream content types are returned unchanged.

For JSON responses, the service parses the payload, rewrites URL-like strings recursively, and serializes the result back to JSON.

## Notes

- Rewriting focuses on absolute `http://` and `https://` URLs.
- Host replacement is an exact hostname match.
- Response header rewriting is opt-in through `rewriteHeaders=true`.
- Environment variable changes are applied when the server starts.
- `POST /rewrite` accepts only `application/json`, `text/plain`, and `application/x-www-form-urlencoded` bodies unless the `url` is provided in the query string.

## Type Checking

```bash
bun run check
```

## License

MIT
