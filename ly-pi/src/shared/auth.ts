import type { Api, Model } from "@earendil-works/pi-ai";

export type AuthResult = {
  apiKey?: string;
  headers?: Record<string, string>;
  /** Provider-scoped env variables (e.g., API keys) forwarded to pi-ai's complete(). */
  env?: Record<string, string>;
};

export type AuthResolver = (
  model: Model<Api>,
) => Promise<AuthResult | undefined>;

/**
 * Build an auth resolver from a model registry's getApiKeyAndHeaders method.
 * Returns a no-op resolver if the method is unavailable.
 *
 * This is the factory behind the repeated 7-line closure in my-permission.
 */
export function createAuthResolver(getApiKeyAndHeaders: unknown): AuthResolver {
  if (typeof getApiKeyAndHeaders === "function") {
    return async (model: Model<Api>) => {
      const auth = await (
        getApiKeyAndHeaders as (model: Model<Api>) => Promise<{
          ok: boolean;
          apiKey?: string;
          headers?: Record<string, string>;
        }>
      )(model);
      return auth.ok
        ? {
            apiKey: auth.apiKey,
            headers: auth.headers,
            env: (auth as Record<string, unknown>).env as
              | Record<string, string>
              | undefined,
          }
        : undefined;
    };
  }
  return async () => undefined;
}

/**
 * Build an auth resolver with a credential-store fallback.
 *
 * First tries createAuthResolver(getApiKeyAndHeaders). If that returns no
 * apiKey, falls back to getApiKeyForProvider which reads directly from the
 * provider credential store (used by the judge, prosecutor, and professor).
 */
export function createAuthResolverWithFallback(
  getApiKeyAndHeaders: unknown,
  getApiKeyForProvider: (provider: string) => Promise<string | undefined>,
): AuthResolver {
  const standard = createAuthResolver(getApiKeyAndHeaders);
  return async (model: Model<Api>) => {
    const result = await standard(model);
    if (result?.apiKey) return result;
    const apiKey = await getApiKeyForProvider(model.provider);
    if (apiKey) return { apiKey };
    return result;
  };
}
