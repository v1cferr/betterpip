"""BetterPiP pin helper: native messaging host for the PiP pin control (ADR 0002).

Promoted from the V1C-129 spike (experiments/v1c-129/host) without behaviour changes. Speaks the WebExtensions native messaging protocol on stdin/stdout
(32-bit native-endian length + UTF-8 JSON) and accepts a CLOSED set of messages:

  {"op": "getState",            "token": T}
  {"op": "setAbove",            "token": T, "value": bool}
  {"op": "setFollowWorkspaces", "token": T, "value": bool}

T identifies the PiP window: the extension puts it in the PiP document title. The token is
only ever compared with titles reported by the compositor; it is never interpolated into a
command. Commands address the window by the compositor's own id (sway con_id, Hyprland
address), which is validated before use. No shell is involved.

Mapping (see docs/spikes/V1C-129 and docs/UX.md "Window pin control"):
  sway      above = floating,  followWorkspaces = sticky (effective only while floating)
  Hyprland  above = floating,  followWorkspaces = pinned (Hyprland pins floating windows)
On both, following workspaces implies floating, so the host reports implied changes.
"""

import json
import os
import re
import struct
import subprocess
import sys

TOKEN = re.compile(r"^bp-[a-z0-9]{8,32}$")
HYPR_ADDR = re.compile(r"^0x[0-9a-f]{1,16}$")
OPS = {"getState", "setAbove", "setFollowWorkspaces"}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
    return r.returncode, (r.stdout + r.stderr).strip()


class Sway:
    name = "sway"

    def find(self, token):
        _, out = run(["swaymsg", "-t", "get_tree", "-r"])
        found = []

        def walk(n, floating):
            if (n.get("name") or "").find(token) >= 0 and n.get("type") in ("con", "floating_con"):
                found.append((n, floating))
            for c in n.get("nodes", []):
                walk(c, floating)
            for c in n.get("floating_nodes", []):
                walk(c, True)
        walk(json.loads(out), False)
        return found[0] if len(found) == 1 else None

    def state(self, token):
        hit = self.find(token)
        if not hit:
            return None
        n, floating = hit
        return {"id": n["id"], "floating": floating, "sticky": bool(n.get("sticky"))}

    def apply(self, win, floating=None, sticky=None):
        con = int(win["id"])  # an integer from the compositor, never the token
        out = []
        if floating is not None:
            out.append(run(["swaymsg", f"[con_id={con}]", "floating", "enable" if floating else "disable"]))
        if sticky is not None:
            out.append(run(["swaymsg", f"[con_id={con}]", "sticky", "enable" if sticky else "disable"]))
        return out

    def view(self, s):
        return {"above": s["floating"], "followWorkspaces": s["floating"] and s["sticky"]}

    def set(self, token, key, value):
        s = self.state(token)
        if not s:
            return None, []
        implied, log = [], []
        if key == "above":
            if not value and s["sticky"]:
                log += self.apply(s, sticky=False); implied.append("followWorkspaces=false")
            log += self.apply(s, floating=value)
        else:
            if value and not s["floating"]:
                log += self.apply(s, floating=True); implied.append("above=true")
            log += self.apply(s, sticky=value)
        return implied, log


class Hyprland:
    name = "hyprland"

    def state(self, token):
        _, out = run(["hyprctl", "clients", "-j"])
        hits = [c for c in json.loads(out) if token in (c.get("title") or "")]
        if len(hits) != 1 or not HYPR_ADDR.match(hits[0].get("address", "")):
            return None
        c = hits[0]
        return {"id": c["address"], "floating": bool(c.get("floating")), "pinned": bool(c.get("pinned"))}

    def toggle(self, win, what):
        # "toggle" is the documented action in Hyprland 0.57's default config; callers only
        # toggle when the read-back state differs from the wanted one.
        sel = f"address:{win['id']}"
        fn = {"float": 'hl.dsp.window.float({ action = "toggle", window = "%s" })',
              "pin": 'hl.dsp.window.pin({ window = "%s" })'}[what]
        return run(["hyprctl", "dispatch", fn % sel])

    def view(self, s):
        return {"above": s["floating"], "followWorkspaces": s["pinned"]}

    def set(self, token, key, value):
        s = self.state(token)
        if not s:
            return None, []
        implied, log = [], []
        if key == "above":
            if not value and s["pinned"]:
                log.append(self.toggle(s, "pin")); implied.append("followWorkspaces=false")
            if s["floating"] != value:
                log.append(self.toggle(s, "float"))
        else:
            if value and not s["floating"]:
                log.append(self.toggle(s, "float")); implied.append("above=true")
            if s["pinned"] != value:
                log.append(self.toggle(s, "pin"))
        return implied, log


def backend():
    if os.environ.get("SWAYSOCK"):
        return Sway()
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        return Hyprland()
    return None


def handle(msg):
    if not isinstance(msg, dict) or msg.get("op") not in OPS:
        return {"ok": False, "error": "unsupported-op"}
    token = msg.get("token")
    if not isinstance(token, str) or not TOKEN.match(token):
        return {"ok": False, "error": "bad-token"}
    b = backend()
    if b is None:
        return {"ok": False, "error": "unsupported-compositor"}
    op = msg["op"]
    if op != "getState":
        if not isinstance(msg.get("value"), bool):
            return {"ok": False, "error": "bad-value"}
        implied, log = b.set(token, "above" if op == "setAbove" else "followWorkspaces", msg["value"])
        if implied is None:
            return {"ok": False, "error": "window-not-found", "backend": b.name}
    else:
        implied, log = [], []
    s = b.state(token)
    if s is None:
        return {"ok": False, "error": "window-not-found", "backend": b.name}
    return {"ok": True, "backend": b.name, "state": b.view(s), "raw": s, "implied": implied,
            "commandErrors": [o for rc, o in log if rc != 0]}


def read():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (n,) = struct.unpack("=I", raw)
    if n > 64 * 1024:
        raise ValueError("message too large")
    return json.loads(sys.stdin.buffer.read(n).decode("utf-8"))


def write(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(data)) + data)
    sys.stdout.buffer.flush()


def main():
    while True:
        try:
            msg = read()
        except (ValueError, json.JSONDecodeError):
            write({"ok": False, "error": "bad-message"})
            return
        if msg is None:
            return
        try:
            write(handle(msg))
        except (OSError, ValueError, subprocess.TimeoutExpired) as e:
            write({"ok": False, "error": "internal", "detail": type(e).__name__})


if __name__ == "__main__":
    main()
