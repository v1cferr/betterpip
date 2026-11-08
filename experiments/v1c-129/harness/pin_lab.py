"""V1C-129 spike: pin control for the Document PiP window through a native messaging helper.

Reuses the M0 lab (experiments/m0/harness/run_lab.py): same server, fixture page, fresh
profile per scenario, Zen attach mode and compositor read-back. Each scenario runs the
browser with a throw-away HOME that holds the native-messaging manifest, so nothing is
installed for the real user. Run it inside experiments/m0/harness/isolated-wayland.sh
(sway), or with --host-compositor on Hyprland (opens real windows).

Usage: python3 pin_lab.py --browser PATH --label firefox [--geckodriver PATH] [--host-compositor]
"""

import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPIKE = HERE.parent
sys.path.insert(0, str(SPIKE.parent / "m0" / "harness"))
from run_lab import Lab  # noqa: E402

HOST_NAME = "betterpip_pin"
EXT_ID = "pin-probe@betterpip.invalid"
# Candidate per-user manifest directories, relative to HOME.
MANIFEST_DIRS = {
    "mozilla": ".mozilla/native-messaging-hosts",
    "xdg-mozilla": ".config/mozilla/native-messaging-hosts",
    "zen": ".zen/native-messaging-hosts",
}


def make_home(dirs, allowed=EXT_ID):
    home = Path(tempfile.mkdtemp(prefix="v1c129-home-"))
    wrapper = home / "betterpip-pin-host"
    wrapper.write_text(f'#!/bin/sh\nexec {sys.executable} -I {SPIKE / "host" / "betterpip_pin_host.py"} "$@"\n')
    wrapper.chmod(0o755)
    manifest = {"name": HOST_NAME, "description": "BetterPiP pin-control spike helper (V1C-129)",
                "path": str(wrapper), "type": "stdio", "allowed_extensions": [allowed]}
    for key in dirs:
        d = home / MANIFEST_DIRS[key]
        d.mkdir(parents=True)
        (d / f"{HOST_NAME}.json").write_text(json.dumps(manifest))
    return home


def host_call(msg, env=None, raw=None):
    """Talk to the helper directly, as the browser would (security checks)."""
    data = raw if raw is not None else json.dumps(msg).encode()
    p = subprocess.run([sys.executable, "-I", str(SPIKE / "host" / "betterpip_pin_host.py")],
                       input=struct.pack("=I", len(data)) + data, capture_output=True, timeout=10, env=env)
    out = p.stdout
    return json.loads(out[4:4 + struct.unpack("=I", out[:4])[0]]) if len(out) >= 4 else {"noReply": True, "rc": p.returncode}


class PinLab(Lab):
    def pack_extension(self):
        out = Path(tempfile.mkdtemp(prefix="v1c129-xpi-")) / "pin-probe.xpi"
        with zipfile.ZipFile(out, "w") as z:
            for f in (SPIKE / "extension").iterdir():
                z.write(f, f.name)
        return out

    def pin_attr(self, key):
        v = self.js(f"return document.documentElement.getAttribute('data-pin-{key}')")
        return json.loads(v) if v else None

    def pip_window(self, token):
        wins = self.compositor() or []
        return next((w for w in wins if token in (w.get("title") or "")), None)

    def with_home(self, sid, dirs, fn, allowed=EXT_ID):
        def wrapped():
            fn()
        home = make_home(dirs, allowed)
        old = os.environ.get("HOME")
        os.environ["HOME"] = str(home)
        try:
            self.run(sid, wrapped)
        finally:
            os.environ["HOME"] = old
            shutil.rmtree(home, ignore_errors=True)

    def open_pip(self):
        self.load()
        self.click("bp-pin-open")
        opened = self.wait(lambda: self.pin_attr("open"), timeout=8)
        first = self.wait(lambda: self.pin_attr("step-1"), timeout=10)
        return opened, first

    def toggles(self):
        opened, first = self.open_pip()
        out = {"open": opened, "steps": [{**(first or {}), "compositor": self.pip_window(opened.get("token", "-")) if opened else None}]}
        if not (opened and opened.get("ok") and first and first["res"].get("ok")):
            self.record("pin-toggles", **out)
            return
        token = opened["token"]
        pip = self.pip_handles()[-1]
        for n, button in enumerate(["pin-above", "pin-follow", "pin-above", "pin-follow", "pin-follow", "pin-above"], start=2):
            self.click(button, pip)
            self.d.switch_to.window(self.main)
            step = self.wait(lambda: self.pin_attr(f"step-{n}"), timeout=10)
            time.sleep(0.3)
            out["steps"].append({**(step or {"missing": n}), "compositor": self.pip_window(token)})
        # Agreement between what the helper reported and what the compositor shows.
        out["agree"] = all(
            s.get("res", {}).get("ok") and s["compositor"]
            and s["res"]["raw"]["floating"] == s["compositor"]["floating"]
            and s["res"]["raw"].get("sticky", s["res"]["raw"].get("pinned")) == s["compositor"].get("sticky", s["compositor"].get("pinned"))
            for s in out["steps"])
        self.record("pin-toggles", **out)

    def only_first(self, sid):
        def fn():
            opened, first = self.open_pip()
            self.record(sid, open=opened, first=first)
        return fn

    def all(self):
        self.with_home("pin-toggles", list(MANIFEST_DIRS), self.toggles)
        if self.args.quick:  # host desktop: one browser launch, then the direct host checks
            self.security()
            return
        for key in MANIFEST_DIRS:  # which manifest location does this browser read?
            self.with_home(f"manifest-dir-{key}", [key], self.only_first(f"manifest-dir-{key}"))
        self.with_home("wrong-extension-id", list(MANIFEST_DIRS), self.only_first("wrong-extension-id"),
                       allowed="someone-else@example.invalid")
        self.with_home("no-helper", [], self.only_first("no-helper"))
        self.security()

    def security(self):
        env = dict(os.environ)
        bare = {k: v for k, v in env.items() if k not in ("SWAYSOCK", "HYPRLAND_INSTANCE_SIGNATURE")}
        cases = {
            "unknown-op": host_call({"op": "exec", "token": "bp-abcdefgh"}, env),
            "token-injection": host_call({"op": "getState", "token": 'bp-x"]; exec rm -rf /tmp/x; ["'}, env),
            "token-shape": host_call({"op": "getState", "token": "BetterPiP"}, env),
            "non-bool-value": host_call({"op": "setAbove", "token": "bp-abcdefgh", "value": "true; kill"}, env),
            "no-such-window": host_call({"op": "setAbove", "token": "bp-abcdefgh", "value": True}, env),
            "oversized": host_call(None, env, raw=b"x" * (70 * 1024)),
            "not-json": host_call(None, env, raw=b"{nope"),
            "no-compositor": host_call({"op": "getState", "token": "bp-abcdefgh"}, bare),
        }
        self.req_mark = len(self.media_requests())
        self.results["scenarios"]["host-security"] = cases
        print("host-security", json.dumps(cases)[:600], flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--browser", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--geckodriver", default=shutil.which("geckodriver"))
    p.add_argument("--port", type=int, default=47140)
    p.add_argument("--out", default=str(SPIKE / "out"))
    p.add_argument("--host-compositor", action="store_true")
    p.add_argument("--quick", action="store_true", help="only the toggle sequence and the host checks")
    a = p.parse_args()
    a.headless, a.only, a.youtube = False, None, None
    lab = PinLab(a)
    try:
        lab.all()
    finally:
        lab.save()


if __name__ == "__main__":
    main()
