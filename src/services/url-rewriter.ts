import type { RewriteRule } from "../config/rules";

type UrlReplacement = {
  original: string;
  rewritten: string;
  changed: boolean;
};

const URL_PATTERN = /https?:\/\/[^\s"'<>`]+/gi;

function stripTrailingPunctuation(value: string): { clean: string; trailing: string } {
  const match = value.match(/[),.;!?]+$/);

  if (!match) {
    return { clean: value, trailing: "" };
  }

  return {
    clean: value.slice(0, -match[0].length),
    trailing: match[0],
  };
}

export function rewriteUrl(input: string, rules: RewriteRule[]): UrlReplacement {
  try {
    const parsed = new URL(input);
    const nextHost = rules.find((rule) => rule.from === parsed.hostname)?.to;

    if (!nextHost) {
      return { original: input, rewritten: input, changed: false };
    }

    parsed.hostname = nextHost;

    return {
      original: input,
      rewritten: parsed.toString(),
      changed: true,
    };
  } catch {
    return { original: input, rewritten: input, changed: false };
  }
}

export function rewriteTextContent(input: string, rules: RewriteRule[]): string {
  return input.replace(URL_PATTERN, (match) => {
    const { clean, trailing } = stripTrailingPunctuation(match);
    const result = rewriteUrl(clean, rules);
    return `${result.rewritten}${trailing}`;
  });
}

export function rewriteUnknownValue<T>(value: T, rules: RewriteRule[]): T {
  if (typeof value === "string") {
    return rewriteTextContent(value, rules) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteUnknownValue(entry, rules)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteUnknownValue(entry, rules)]),
    ) as T;
  }

  return value;
}
