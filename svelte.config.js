// Component styles are injected next to the mount target, i.e. into the PiP document, never
// into the host page (ADR 0003 §7; validated in experiments/v1c-121).
export default { compilerOptions: { css: "injected" } };
