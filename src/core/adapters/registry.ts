// Adapter registry with failure isolation (ADR 0003 §5.5): an adapter that throws, rejects
// or times out is disposed and reported; the generic session keeps working.
import { bpError, type BpError } from "../contracts/errors";
import type { AdapterContext, AdapterHandle, SiteAdapter } from "./types";

export const DEFAULT_ADAPTER_TIMEOUT_MS = 2000;

export type AttachResult =
  | { kind: "generic" }
  | { kind: "adapter"; id: string; handle: AdapterHandle }
  | { kind: "failed"; id: string; error: BpError };

export async function attachAdapter(
  adapters: readonly SiteAdapter[],
  ctx: AdapterContext,
  timeoutMs = DEFAULT_ADAPTER_TIMEOUT_MS,
): Promise<AttachResult> {
  let adapter: SiteAdapter | undefined;
  try {
    adapter = adapters.find((a) => a.matches(ctx.url));
  } catch (e) {
    const error = bpError("ADAPTER_FAILED", "Adapter match threw", true, e);
    ctx.log(error);
    return { kind: "failed", id: "unknown", error };
  }
  if (!adapter) return { kind: "generic" };

  const scope = ctx.scope.child();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const attached = adapter.attach({ ...ctx, scope });
    const result = await Promise.race([attached, timeout]);
    if (result === "timeout") {
      scope.dispose();
      // A late handle must not stay alive either.
      attached.then((h) => safeDispose(h), () => {});
      const error = bpError("ADAPTER_TIMEOUT", `Adapter ${adapter.id} did not attach within ${timeoutMs} ms`);
      ctx.log(error);
      return { kind: "failed", id: adapter.id, error };
    }
    scope.defer(() => safeDispose(result));
    return { kind: "adapter", id: adapter.id, handle: result };
  } catch (e) {
    scope.dispose();
    const error = bpError("ADAPTER_FAILED", `Adapter ${adapter.id} failed to attach`, true, e);
    ctx.log(error);
    return { kind: "failed", id: adapter.id, error };
  } finally {
    clearTimeout(timer);
  }
}

function safeDispose(h: AdapterHandle) {
  try {
    h.dispose();
  } catch {
    // contract: disposal never throws upward
  }
}
