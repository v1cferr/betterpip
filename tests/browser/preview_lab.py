"""Browser check for the preview build (.output/firefox-mv3) in the isolated sway session.

Reuses the M0 harness: fixture page, fresh profile, trusted WebDriver input. Opens BetterPiP
through the real entry (the extension shortcut), clicks the in-page button, then drives the
PiP UI and takes screenshots at several window sizes. Writes tests/browser/out/.

Run: experiments/m0/harness/isolated-wayland.sh "$py" tests/browser/preview_lab.py \
       --geckodriver "$gd" --browser "$firefox" --label firefox
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "experiments" / "m0" / "harness"))
from run_lab import Lab  # noqa: E402

OUT = Path(__file__).resolve().parent / "out"


class PreviewLab(Lab):
    def pack_extension(self):
        src = ROOT / ".output" / "firefox-mv3"
        out = Path(tempfile.mkdtemp(prefix="bp-preview-")) / "betterpip.xpi"
        with zipfile.ZipFile(out, "w") as z:
            for f in src.rglob("*"):
                if f.is_file() and f.name != "manifest.json":
                    z.write(f, f.relative_to(src).as_posix())
            manifest = json.loads((src / "manifest.json").read_text())
            if self.args.declare:
                # Lab-only: the extension cannot see tabs in the Zen attach mode (V1C-120), so
                # the injection is declared for the local fixture instead of done on demand.
                manifest["content_scripts"] = [{"matches": ["http://127.0.0.1/*"], "js": ["content-scripts/player.js"], "run_at": "document_idle"}]
            z.writestr("manifest.json", json.dumps(manifest))
        return out

    def shot(self, handle, name):
        self.d.switch_to.window(handle)
        path = OUT / f"{self.args.label}-{name}.png"
        path.write_bytes(self.d.get_screenshot_as_png())
        return path.name

    def pip_con(self):
        tree = json.loads(subprocess.run(["swaymsg", "-t", "get_tree", "-r"], capture_output=True, text=True).stdout)
        found = []
        def walk(n):
            if (n.get("name") or "").startswith("BetterPiP —"):
                found.append(n)
            for c in n.get("nodes", []) + n.get("floating_nodes", []):
                walk(c)
        walk(tree)
        return found[0]["id"] if found else None

    def size(self, con, w, h):
        subprocess.run(["swaymsg", f"[con_id={con}]", "floating", "enable"], capture_output=True)
        subprocess.run(["swaymsg", f"[con_id={con}]", "resize", "set", "width", f"{w}px", "height", f"{h}px"], capture_output=True)
        time.sleep(0.8)

    def flow(self):
        out = {}
        self.load("/site/index.html")
        out["pageStylesBefore"] = self.js("return document.querySelectorAll('style, link[rel=stylesheet]').length")
        self.click("play")
        time.sleep(1.5)
        # Real entry point: the extension shortcut, dispatched in the browser chrome.
        if self.args.declare:
            out["entry"] = "declared content script (lab-only)"
        else:
            with self.d.context(self.d.CONTEXT_CHROME):
                ActionChains(self.d).key_down(Keys.ALT).key_down(Keys.SHIFT).send_keys("p").key_up(Keys.SHIFT).key_up(Keys.ALT).perform()
        time.sleep(1.5)
        out["openedDirectlyFromShortcut"] = bool(self.pip_handles())
        if not out["openedDirectlyFromShortcut"]:
            self.d.switch_to.window(self.main)
            out["affordanceShot"] = self.shot(self.main, "0-affordance")
            v = self.d.find_element(By.ID, "v")
            r = v.rect
            # The button sits 12 px inside the video's top-right corner (page-ui/affordance.ts).
            ActionChains(self.d).move_to_element_with_offset(v, int(r["width"] / 2 - 120), int(-r["height"] / 2 + 30)).click().perform()
        pip = self.wait(lambda: self.pip_handles(), timeout=8)
        if not pip:
            out["error"] = "no PiP window"
            self.record("preview", **out)
            return
        pip = pip[-1]
        time.sleep(1.5)
        self.d.switch_to.window(self.main)
        out["pageStylesAfter"] = self.js("return document.querySelectorAll('style, link[rel=stylesheet]').length")
        out["videoInPip"] = self.js("return document.querySelector('#v') === null")
        con = self.pip_con()
        shots = []
        for name, (w, h), key in [("1-overlay-720", (720, 405), "2"), ("2-docked-960", (960, 480), "3"),
                                  ("3-docked-fallback-560", (560, 315), "3"), ("4-minimal-720", (720, 405), "1"),
                                  ("5-small-300", (300, 170), "2")]:
            self.size(con, w, h)
            self.d.switch_to.window(pip)
            ActionChains(self.d).send_keys(key).perform()
            ActionChains(self.d).move_to_element(self.d.find_element(By.TAG_NAME, "body")).perform()  # show chrome
            time.sleep(0.5)
            layout = self.js("return document.querySelector('[data-layout]')?.dataset.layout")
            shots.append({"name": name, "layout": layout, "file": self.shot(pip, name)})
        out["shots"] = shots
        # Interactions inside the PiP: tabs (Bits UI), keyboard play/pause, the Window tab.
        self.size(con, 960, 480)
        self.d.switch_to.window(pip)
        ActionChains(self.d).send_keys("3").perform()
        time.sleep(0.4)
        tabs = self.d.find_elements(By.CSS_SELECTOR, "[role=tab]")
        out["tabs"] = [t.text for t in tabs]
        if tabs:
            tabs[0].click()
            ActionChains(self.d).send_keys(Keys.ARROW_RIGHT).perform()
            time.sleep(0.3)
            out["tabArrowMovesFocus"] = self.js("return document.activeElement?.textContent?.trim()")
            tabs[-1].click()
            time.sleep(0.4)
            out["windowTabShot"] = self.shot(pip, "6-window-tab")
        self.d.switch_to.window(pip)
        before = self.js("return document.querySelector('video').paused")
        self.d.find_element(By.TAG_NAME, "body").click()
        ActionChains(self.d).send_keys("k").perform()
        time.sleep(0.4)
        out["kTogglesPlayback"] = before != self.js("return document.querySelector('video').paused")
        out["pinState"] = self.js("return [...document.querySelectorAll('[aria-label^=\"Keep above\"]')].map(b => b.getAttribute('aria-label'))")
        # Return to the tab.
        self.d.find_element(By.CSS_SELECTOR, "[aria-label='Return video to the tab']").click()
        time.sleep(1.2)
        self.d.switch_to.window(self.main)
        out["videoBackInPage"] = self.js("return !!document.querySelector('#slot #v')")
        out["playingAfterReturn"] = self.js("return !document.querySelector('#v').paused")
        self.record("preview", **out)

    def all(self):
        OUT.mkdir(parents=True, exist_ok=True)
        self.run("preview", self.flow)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--browser", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--geckodriver", default=shutil.which("geckodriver"))
    p.add_argument("--port", type=int, default=47160)
    p.add_argument("--out", default=str(OUT))
    p.add_argument("--declare", action="store_true", help="lab-only declared injection (Zen attach mode)")
    a = p.parse_args()
    a.headless, a.only, a.youtube, a.host_compositor = False, None, None, False
    lab = PreviewLab(a)
    try:
        lab.all()
    finally:
        lab.save()


if __name__ == "__main__":
    main()
