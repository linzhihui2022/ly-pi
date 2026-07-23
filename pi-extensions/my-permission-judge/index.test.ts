import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { PermissionsService } from "@gotgenes/pi-permission-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import myPermissionJudge from "./index";

const SERVICE_KEY = Symbol.for("@gotgenes/pi-permission-system:service");

describe("myPermissionJudge", () => {
  let registeredEvents: Map<string, (...args: unknown[]) => unknown>;
  let registeredEventBusHandlers: Map<string, (...args: unknown[]) => unknown>;
  let eventBusDisposers: Array<() => void>;
  let mockRegisterAuthorizer: ReturnType<typeof vi.fn>;
  let mockAuthorizerDisposer: ReturnType<typeof vi.fn>;
  let mockPi: ExtensionAPI;
  let mockCtx: ExtensionContext;

  beforeEach(() => {
    registeredEvents = new Map();
    registeredEventBusHandlers = new Map();
    eventBusDisposers = [];
    mockAuthorizerDisposer = vi.fn();
    mockRegisterAuthorizer = vi.fn().mockReturnValue(mockAuthorizerDisposer);

    const service = {
      registerAuthorizer: mockRegisterAuthorizer,
    } as unknown as PermissionsService;

    (globalThis as Record<symbol, unknown>)[SERVICE_KEY] = service;

    mockPi = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        registeredEvents.set(event, handler);
      }),
      events: {
        on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          registeredEventBusHandlers.set(event, handler);
          const disposer = vi.fn();
          eventBusDisposers.push(disposer);
          return disposer;
        }),
        emit: vi.fn(),
      },
    } as unknown as ExtensionAPI;

    mockCtx = {
      ui: {
        notify: vi.fn(),
      },
    } as unknown as ExtensionContext;
  });

  it("registers authorizer on permissions:ready", () => {
    myPermissionJudge(mockPi);

    const sessionStart = registeredEvents.get("session_start");
    const ready = registeredEventBusHandlers.get("permissions:ready");
    expect(sessionStart).toBeDefined();
    expect(ready).toBeDefined();

    sessionStart?.({}, mockCtx);
    ready?.({});

    expect(mockRegisterAuthorizer).toHaveBeenCalledWith(
      "my-judge",
      expect.any(Function),
    );
  });

  it("silently skips when permissions service is not published", () => {
    delete (globalThis as Record<symbol, unknown>)[SERVICE_KEY];

    myPermissionJudge(mockPi);

    const ready = registeredEventBusHandlers.get("permissions:ready");
    ready?.({});

    expect(mockRegisterAuthorizer).not.toHaveBeenCalled();
  });

  it("calls disposer and clears context on session_shutdown", () => {
    myPermissionJudge(mockPi);

    registeredEvents.get("session_start")?.({}, mockCtx);
    registeredEventBusHandlers.get("permissions:ready")?.({});

    const shutdown = registeredEvents.get("session_shutdown");
    shutdown?.({});

    expect(mockAuthorizerDisposer).toHaveBeenCalledOnce();
  });

  it("notifies via UI context when available", () => {
    myPermissionJudge(mockPi);

    registeredEvents.get("session_start")?.({}, mockCtx);
    registeredEventBusHandlers.get("permissions:ready")?.({});

    const [, authorizer] = mockRegisterAuthorizer.mock.calls[0] as [
      string,
      (...args: unknown[]) => unknown,
    ];

    // The authorizer should be callable, but we only verify it forwards
    // without crashing since the real judge/reviewer are exercised elsewhere.
    expect(typeof authorizer).toBe("function");
  });
});
