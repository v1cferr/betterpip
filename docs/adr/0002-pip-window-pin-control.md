# ADR 0002 — PiP window pin control

| | |
| --- | --- |
| Status | **Accepted**, 2026-11-08 (V1C-129 spike: sway and Hyprland, Firefox and Zen) |
| Jira | [V1C-129](https://v1cferr.atlassian.net/browse/V1C-129) (follow-up of [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120), under [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119)) |
| Depends on | [ADR 0001 — PiP window backend](0001-pip-window-backend.md) (Accepted) |
| Evidence | [V1C-129 spike report](../spikes/V1C-129/README.md), [V1C-120 "Pin control"](../spikes/V1C-120/README.md#pin-control-new-requirement), [results](../../experiments/v1c-129/results/) |

## 1. Context

ADR 0001 made Document PiP the window backend. On Wayland the browser cannot keep that
window above others; on Hyprland 0.57.1 the window opens floating, and a compositor *pin*
kept it visible over other applications and across workspaces (manual checks M1–M4).

During those checks the user asked for a **visible pin control in the PiP UI**. The control
must let the user decide two things separately:

1. **Above others:** the window stays above all other windows.
2. **Follow workspaces:** the window stays visible when the user switches workspace.

## 2. Requirements

- Both choices belong to the user. They are off by default and can be toggled at any time
  from the PiP window. Both are keyboard accessible, and each shows its current state.
- No claim of support where the platform cannot deliver it. An unavailable option is shown
  as unavailable, with the reason, not hidden behind a silent failure.
- Public, supported APIs only. Nothing is written to the user's compositor or browser
  configuration without explicit consent.
- Minimal permissions. The browser part must not gain the ability to run arbitrary
  commands.

## 3. Constraints found in V1C-120

- Document PiP has no stacking API. The WebExtensions `windows` API has no always-on-top
  flag. A Wayland client cannot request "above" or "sticky" at all.
- Hyprland's *pin* couples both choices: a pinned window floats and appears on every
  workspace. A plain floating window already sits above tiled windows on its own workspace.
  How it stacks against other floating or fullscreen windows was not measured.
- Other environments differ:
  - sway has *sticky*, which applies to floating windows.
  - X11 window managers expose independent `_NET_WM_STATE_ABOVE` and `_NET_WM_STATE_STICKY`.
  - Windows and macOS were not examined.
- The PiP window has a stable, page-controlled title (`BetterPiP …`) and the browser's
  app_id/class. That is enough for an external helper to find it.

## 4. Options

| Option | Description | Delivers the control? | Cost |
| --- | --- | --- | --- |
| **A. Native messaging helper** | An optional host program, reached through `runtime.connectNative` (`nativeMessaging` permission), finds the PiP window and calls the compositor: `hyprctl`, `swaymsg`, an EWMH client on X11. | Yes, where the helper supports the compositor | Separate install per OS; per-compositor code; security review |
| B. Documented window rule only | Docs ship a rule matching `^BetterPiP` (float, pin). There is no button. | No (static, all-or-nothing) | Docs only |
| **C. Capability-gated hybrid** | A plus B: the pin control appears and works when the helper is installed and supports the current compositor; otherwise the PiP UI shows that the option needs the helper or a rule, and links the docs. | Yes, progressively | As A, plus one capability check |
| D. Privileged browser integration | userChrome, patched builds, Zen internals. | Possibly | Rejected by ADR 0001 (D) |

## 5. Proposed decision

**C, capability-gated hybrid.**

- Add a `windowStacking` capability to the registry (V1C-121). Its values:
  - `none`: no helper; show the rule instructions.
  - `helper` with per-option support (`above`, `followWorkspaces`), each `supported`,
    `coupled` or `unsupported`.
- The helper is optional and separately installed. It accepts only a closed set of
  messages: `setAbove(bool)`, `setFollowWorkspaces(bool)` and `getState()`, each for the PiP
  window of the calling browser. It never takes command strings, runs no shell, and is
  restricted to BetterPiP through `allowed_extensions`.
- Window identification: a per-session token in the PiP document title, matched together
  with the browser's process id where the compositor reports it.
- Where the compositor couples the two options (Hyprland *pin*), the UI must say so, for
  example "follows workspaces (required by Hyprland to stay on top)". It must not pretend
  the two options are independent.

## 6. Consequences

- A second, non-browser deliverable with its own packaging (V1C-127) and tests (V1C-126).
- `nativeMessaging` becomes an optional permission, requested only when the user enables
  the pin control.
- Everything else in BetterPiP keeps working without the helper.

## 6a. Spike evidence (2026-11-08)

On isolated sway and on the host Hyprland 0.57.1 desktop, with Firefox 159.0 and Zen 1.24b,
the proposed design worked end to end:
- PiP toggles → background → `sendNativeMessage` → helper → `swaymsg` / `hyprctl`;
- helper state matched compositor state on all 7 steps, at 44–137 ms per toggle;
- `allowed_extensions` and the closed message set held against every hostile input tried.

Both browsers read the manifest only from `~/.mozilla/native-messaging-hosts`. The two
options are coupled on sway and, by its API, on Hyprland: following workspaces requires
floating. The UI therefore shows that coupling.

## 7. Open questions

1. On Hyprland 0.57: can "above others" be had **without** pin? Per the Lua API: floating
   gives it within the workspace, and there is no persistent keep-above property. Over
   fullscreen windows, `binds.allow_pin_fullscreen` applies (not measured). The toggles
   themselves were verified on the host desktop.
2. ~~On sway, are the two options independent?~~ No: sticky only applies to floating
   windows.
3. ~~Can the helper find the PiP window?~~ Yes: a random title token gives exactly one
   match.
4. ~~Does Zen support `nativeMessaging` like Firefox?~~ Yes, with the same manifest
   location (`~/.mozilla/native-messaging-hosts`).
5. Windows and macOS: is there any acceptable path, or is it documented as unsupported?

## 8. Validation plan

This is a spike in the isolated lab, like M0. It needs no change to the host system:

- Launch the browser with a temporary `HOME`, so the native-messaging manifest lives in a
  throw-away directory.
- Use a minimal helper with the closed message set above.
- Under isolated sway: toggle each option, then read the state back from the compositor.
- On the Hyprland host: run the same toggles and read back with `hyprctl clients`.

Done on 2026-11-08: see the [V1C-129 report](../spikes/V1C-129/README.md). The UX contract is
in [UX.md](../UX.md#window-pin-control-v1c-129). Still open for the product: requesting
`nativeMessaging` as an optional permission at enable time, packaging the helper (V1C-127),
X11/KDE/GNOME/Windows/macOS backends, and behaviour over fullscreen windows.
