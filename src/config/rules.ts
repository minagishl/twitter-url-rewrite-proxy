export type RewriteRule = {
  from: string;
  to: string;
};

export type RewriteRuleFile = {
  rules: RewriteRule[];
};

const RULES_JSON_ENV_NAME = "REWRITE_RULES_JSON";
const RULES_INLINE_ENV_NAME = "REWRITE_RULES";

export const builtInRules: RewriteRule[] = [
  { from: "x.com", to: "fixupx.com" },
  { from: "twitter.com", to: "fxtwitter.com" },
];

function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

function isValidHost(host: string): boolean {
  return /^[a-z0-9.-]+$/i.test(host) && !host.includes("..");
}

function parseInlineRules(value: string): RewriteRule[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [from, to] = entry.split(":").map((part) => part?.trim() ?? "");

      if (!from || !to) {
        throw new Error(`${RULES_INLINE_ENV_NAME} entries must use the format "from:to".`);
      }

      return { from, to };
    });
}

function parseEnvironmentRules(): RewriteRule[] {
  const jsonValue = Bun.env[RULES_JSON_ENV_NAME];
  const inlineValue = Bun.env[RULES_INLINE_ENV_NAME];
  const rules: RewriteRule[] = [];

  if (jsonValue) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonValue);
    } catch (error) {
      throw new Error(`${RULES_JSON_ENV_NAME} must contain valid JSON: ${String(error)}`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("rules" in parsed) ||
      !Array.isArray((parsed as RewriteRuleFile).rules)
    ) {
      throw new Error(
        `${RULES_JSON_ENV_NAME} must match { "rules": [{ "from": "...", "to": "..." }] }.`,
      );
    }

    rules.push(...(parsed as RewriteRuleFile).rules);
  }

  if (inlineValue) {
    rules.push(...parseInlineRules(inlineValue));
  }

  return rules;
}

export function normalizeRules(rules: RewriteRule[]): RewriteRule[] {
  const deduplicated = new Map<string, RewriteRule>();

  for (const rule of rules) {
    const from = normalizeHost(rule.from);
    const to = normalizeHost(rule.to);

    if (!from || !to) {
      throw new Error("Rewrite rules must include both from and to hosts.");
    }

    if (!isValidHost(from) || !isValidHost(to)) {
      throw new Error(`Invalid host rewrite rule: ${rule.from} -> ${rule.to}`);
    }

    deduplicated.set(from, { from, to });
  }

  return [...deduplicated.values()];
}

export function loadRules(): RewriteRule[] {
  return normalizeRules([...builtInRules, ...parseEnvironmentRules()]);
}

export const ruleEnvNames = {
  json: RULES_JSON_ENV_NAME,
  inline: RULES_INLINE_ENV_NAME,
} as const;
