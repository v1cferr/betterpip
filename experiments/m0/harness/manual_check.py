"""Guided manual checks M1-M8 for V1C-120 on the host Hyprland desktop.

Opens a real browser window ON THE USER'S DESKTOP (that is the point of these checks), with
a throw-away profile and the probe extension installed as temporary. The terminal walks
through each check: the human does the step and types what they saw, and the script
attaches what it can observe by itself (hyprctl window state, page events, media state).
Writes <out>/manual-<label>.json. Nothing is written to the Hyprland or browser config;
the only compositor change is a runtime float + pin on the PiP window in M3.

Usage: python3 manual_check.py --browser PATH --label firefox [--geckodriver PATH]
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from selenium.common.exceptions import WebDriverException

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_lab import LAB, Lab, descendants  # noqa: E402


class ManualLab(Lab):
    def prefs(self):
        # Audible on purpose: M6 asks the human whether the sound has gaps.
        return {"media.autoplay.default": 0, "browser.shell.checkDefaultBrowser": False}

    def clients(self):
        pids = {self.browser_pid, *descendants(self.browser_pid)} if self.browser_pid else set()
        try:
            out = json.loads(subprocess.run(["hyprctl", "clients", "-j"], capture_output=True, text=True, timeout=5).stdout)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            return []
        keep = ("address", "class", "title", "floating", "pinned", "size", "at", "workspace", "focusHistoryID", "fullscreen", "xwayland")
        return [{k: c.get(k) for k in keep} for c in out if c.get("pid") in pids]

    def pip_client(self):
        new = [c for c in self.clients() if c["address"] not in self.known]
        return new[-1] if new else None

    def page(self, script):
        try:
            self.d.switch_to.window(self.main)
            return self.js(script)
        except WebDriverException as e:
            return {"error": str(e).splitlines()[0]}


def ask(step, text):
    print(f"\n\033[1m{step}\033[0m\n{text}")
    return input("  → what happened? (pass / fail / note): ").strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--browser", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--geckodriver")
    p.add_argument("--port", type=int, default=47130)
    p.add_argument("--out", default=str(LAB / "out"))
    a = p.parse_args()
    # Fields the base Lab expects.
    a.headless, a.host_compositor, a.only, a.youtube = False, True, None, None

    lab = ManualLab(a)
    res = {"meta": lab.results["meta"], "checks": {}}
    note = lambda k, answer, **auto: res["checks"].__setitem__(k, {"answer": answer, "observed": auto})
    try:
        lab.req_mark = 0
        lab.start()
        lab.load()
        lab.known = {c["address"] for c in lab.clients()}
        res["meta"]["versionString"] = lab.results["meta"].get("versionString")
        print(f"\n=== {a.label}: browser open at {lab.base}/site/index.html ===")

        input("\nM1  In the browser: click 'Play', then 'E3/E4: move video + tools into PiP'.\n"
              "    Press Enter here once the PiP window is open... ")
        time.sleep(0.5)
        pip = lab.pip_client()
        note("M1", ask("M1", "Did Hyprland float or tile the PiP window? Did it get keyboard focus?"),
             pipWindow=pip, focusAtOpen=lab.page("return __m0.results.e3 && __m0.results.e3.open.focusAtOpen"))

        note("M2", ask("M2", "Click another application (terminal, editor) so it covers the PiP area.\n"
                             "Does the PiP stay visible above it?"), pipWindow=lab.pip_client())

        pip = lab.pip_client()
        applied = None
        if pip:
            sel = f'address:{pip["address"]}'
            applied = [subprocess.run(["hyprctl", "dispatch", cmd], capture_output=True, text=True).stdout.strip() for cmd in (
                f'hl.dsp.window.float({{ action = "enable", window = "{sel}" }})',
                f'hl.dsp.window.pin({{ window = "{sel}" }})')]
            time.sleep(0.5)
        after = lab.pip_client()
        print(f"\n    Applied float + pin at runtime: floating={after and after['floating']} pinned={after and after['pinned']}")
        note("M3", ask("M3", "The PiP should now float and be pinned (nothing written to your config).\n"
                             "Is that what you see?"), dispatch=applied, pipWindow=after)

        note("M4", ask("M4", "Switch workspaces, use other apps, and put another app in fullscreen.\n"
                             "Does the PiP stay above them? What happens in fullscreen?"), pipWindow=lab.pip_client())

        mark = len(lab.page("return __m0.events") or [])
        note("M5", ask("M5", "Drag the PiP edges and corners from very wide to very small.\n"
                             "Does the layout go side panel → overlay → video only, without overflow, still playing?"),
             containerEvents=[e for e in (lab.page("return __m0.events") or [])[mark:] if e.get("type") == "e4:container"][-12:],
             pipWindow=lab.pip_client())

        before = lab.page("return __m0.snapshot()")
        reqs = len(lab.media_requests())
        note("M6", ask("M6", "Minimise or hide the browser window, switch tabs, let it play ~1 minute.\n"
                             "Does it keep playing? Any audio gap?"),
             before=before, after=lab.page("return __m0.snapshot()"), extraMediaRequests=len(lab.media_requests()) - reqs)

        note("M7", ask("M7", "Close the PiP with its window close button (and, if the browser shows one,\n"
                             "reopen it and use the 'back to tab' button). Is the video back in the page,\n"
                             "same position, still playing? Where did keyboard focus go?"),
             restore=lab.page("return __m0.results.restore"),
             events=[e for e in (lab.page("return __m0.events") or []) if e.get("type") in ("pip:pagehide", "e3:restored", "opener:focus", "pip:blur")][-6:])

        note("M8", ask("M8", "Close any PiP. Click the extension's toolbar button (or the extensions menu entry\n"
                             "'BetterPiP M0 probe'), then focus the page and press Alt+Shift+9.\n"
                             "Did either open a PiP window?"),
             extension=lab.page("""const o = {}; for (const a of document.documentElement.attributes)
                 if (/^data-m0-(bg-(action|command)|tabs-probe)/.test(a.name)) o[a.name.slice(8)] = JSON.parse(a.value); return o;"""))
        res["notes"] = input("\nAnything else (keyboard inside PiP, Minimal/Overlay/Docked buttons, oddities)? ").strip()
    except (KeyboardInterrupt, EOFError):
        res["aborted"] = True
        print("\naborted; saving what was recorded")
    finally:
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        path = out / f"manual-{a.label}.json"
        path.write_text(json.dumps(res, indent=1))
        print(f"\nsaved {path}")
        lab.stop()
        lab.server.terminate()


if __name__ == "__main__":
    main()
