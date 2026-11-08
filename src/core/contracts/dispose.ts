// Disposal contract (ADR 0003 §5.1): every subscription hangs off an AbortSignal, so one
// abort() releases listeners, observers and timers together.

export interface Disposable {
  dispose(): void;
}

export interface Scope extends Disposable {
  readonly signal: AbortSignal;
  readonly disposed: boolean;
  /** Runs `fn` when the scope is disposed (in reverse registration order). */
  defer(fn: () => void): void;
  /** A child scope, disposed together with this one. */
  child(): Scope;
}

export function createScope(parent?: Scope): Scope {
  const controller = new AbortController();
  const deferred: Array<() => void> = [];
  const scope: Scope = {
    get signal() {
      return controller.signal;
    },
    get disposed() {
      return controller.signal.aborted;
    },
    defer(fn) {
      if (controller.signal.aborted) fn();
      else deferred.push(fn);
    },
    child() {
      return createScope(scope);
    },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const fn of deferred.splice(0).reverse()) {
        try {
          fn();
        } catch {
          // Disposal never throws (contract); a failing cleanup must not stop the others.
        }
      }
    },
  };
  parent?.defer(() => scope.dispose());
  return scope;
}
