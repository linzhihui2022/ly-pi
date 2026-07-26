import type { Api, Model } from "@earendil-works/pi-ai";

export type AuthResult = {
  apiKey?: string;
  headers?: Record<string, string>;
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
export function createAuthResolver(
  getApiKeyAndHeaders: unknown,
): AuthResolver {
  if (typeof getApiKeyAndHeaders === "function") {
    return async (model: Model<Api>) => {
      const auth = await (
        getApiKeyAndHeaders as (
          model: Model<Api>,
        ) => Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string> }>
      )(model);
      return auth.ok ? { apiKey: auth.apiKey, headers: auth.headers } : undefined;
    };
  }
  return async () => undefined;
}
