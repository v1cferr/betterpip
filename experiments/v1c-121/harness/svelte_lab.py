"""V1C-121 spike: Svelte 5 mounted from an isolated content script into Document PiP.

Reuses the M0 harness (server, fixture pages incl. the CSP probe page, fresh profiles,
Zen attach mode). Build the bundle first (see ../README.md). Run inside
experiments/m0/harness/isolated-wayland.sh.
"""

import argparse
import json
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from selenium.webdriver.common.by import By

HERE = Path(__file__).resolve().parent
SPIKE = HERE.parent
sys.path.insert(0, str(SPIKE.parent / "m0" / "harness"))
from run_lab import Lab  # noqa: E402


class SvelteLab(Lab):
    def pack_extension(self):
        out = Path(tempfile.mkdtemp(prefix="v1c121-xpi-")) / "svelte-probe.xpi"
        with zipfile.ZipFile(out, "w") as z:
            for f in (SPIKE / "extension").iterdir():
                if f.suffix in (".js", ".json"):
                    z.write(f, f.name)
        return out

    def sv(self, key):
        v = self.js(f"return document.documentElement.getAttribute('data-sv-{key}')")
        return json.loads(v) if v else None

    def scenario(self, policy):
        def fn():
            self.load(f"/site/csp.html?csp={policy}")
            self.click("play")
            time.sleep(1.0)
            self.click("sv-open")
            out = {"policy": policy, "mount": self.wait(lambda: self.sv("mount"), timeout=8)}
            if not (out["mount"] or {}).get("ok"):
                self.record(f"svelte-{policy}", **out)
                return
            pip = self.pip_handles()[-1]
            self.click("sv-count", pip); self.click("sv-count", pip)
            self.d.switch_to.window(pip)
            self.d.find_element(By.ID, "sv-input").send_keys("abc")
            time.sleep(0.3)
            out["echo"] = self.d.find_element(By.ID, "sv-echo").text
            t1 = float(self.d.find_element(By.ID, "sv-time").text); time.sleep(1.2)
            out["timeAdvances"] = float(self.d.find_element(By.ID, "sv-time").text) > t1
            self.d.switch_to.window(self.main)
            out["click"] = self.sv("click")
            out["effect"] = self.sv("effect")
            # Outro with the opener visible.
            self.click("sv-toggle", pip)
            time.sleep(1.0)
            self.d.switch_to.window(self.main)
            out["outroVisible"] = {"toggle": self.sv("toggle"), "end": self.sv("outroend")}
            # Intro while the opener tab is hidden: does the transition depend on its rAF?
            # Select a new tab through the browser UI (chrome context), so the opener tab is
            # really hidden; a WebDriver-only switch does not change the selected tab.
            self.d.switch_to.window(self.main)  # chrome context of the opener's browser window
            with self.d.context(self.d.CONTEXT_CHROME):
                out["tabSwitch"] = self.js("""const opener = gBrowser.selectedTab;
                    window.__bpBlank = gBrowser.addTrustedTab('about:blank'); gBrowser.selectedTab = window.__bpBlank;
                    return {selectedIsBlank: gBrowser.selectedTab === window.__bpBlank,
                            openerSelected: opener.selected, openerDocShellActive: opener.linkedBrowser.docShellIsActive};""")
            time.sleep(0.5)
            out["handlesAfterTabSwitch"] = len(self.d.window_handles)
            with self.d.context(self.d.CONTEXT_CHROME):
                out["tabSwitchAfter500ms"] = self.js("const t = gBrowser.tabs.find(t => t !== window.__bpBlank); return {openerSelected: t.selected, openerDocShellActive: t.linkedBrowser.docShellIsActive, selectedIsBlank: gBrowser.selectedTab === window.__bpBlank}")
            out["pipStillOpen"] = pip in self.d.window_handles
            if not out["pipStillOpen"]:
                self.record(f"svelte-{policy}", **out)
                return
            self.click("sv-toggle", pip)
            time.sleep(3.0)
            self.d.switch_to.window(pip)
            out["introWhileHidden_opacity"] = self.js("const e=document.getElementById('sv-fading'); return e && getComputedStyle(e).opacity")
            self.d.switch_to.window(self.main)
            with self.d.context(self.d.CONTEXT_CHROME):
                self.js("gBrowser.removeTab(window.__bpBlank)")
            time.sleep(0.5)
            self.d.switch_to.window(self.main)
            time.sleep(0.8)
            out["introHidden"] = {"toggle": self.sv("toggle"), "end": self.sv("introend")}
            out["violations"] = self.sv("violations")
            self.click("sv-unmount")
            time.sleep(0.5)
            out["unmount"] = self.sv("unmount")
            out["destroyed"] = self.sv("destroyed")
            self.record(f"svelte-{policy}", **out)
        def traced():
            try:
                fn()
            except Exception:
                import traceback
                traceback.print_exc(limit=3)
                raise
        self.run(f"svelte-{policy}", traced)

    def all(self):
        for policy in self.args.policies:
            self.scenario(policy)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--browser", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--geckodriver", default=shutil.which("geckodriver"))
    p.add_argument("--port", type=int, default=47150)
    p.add_argument("--out", default=str(SPIKE / "out"))
    p.add_argument("--policies", type=lambda v: v.split(","), default=["none", "strict", "tt"])
    a = p.parse_args()
    a.headless, a.only, a.youtube, a.host_compositor = False, None, None, False
    lab = SvelteLab(a)
    try:
        lab.all()
    finally:
        lab.save()


if __name__ == "__main__":
    main()
