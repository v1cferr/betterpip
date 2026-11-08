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
        src = ROOT / ".output" / ("firefox-mv3-dev" if self.args.dev else "firefox-mv3")
        out = Path(tempfile.mkdtemp(prefix="bp-preview-")) / "betterpip.xpi"
        with zipfile.ZipFile(out, "w") as z:
            for f in src.rglob("*"):
                if f.is_file() and f.name != "manifest.json":
                    z.write(f, f.relative_to(src).as_posix())
            manifest = json.loads((src / "manifest.json").read_text())
            if self.args.declare:
                # Lab-only: the extension cannot see tabs in the Zen attach mode (V1C-120), so
                # the injection is declared for the local fixture instead of done on demand.
                matches = ["https://www.youtube.com/*"] if self.args.youtube else ["http://127.0.0.1/*"]
                manifest["content_scripts"] = [{"matches": matches, "js": ["content-scripts/player.js"], "run_at": "document_idle"}]
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

    def open_with_shortcut(self, video_css, declared=False):
        """Real entry: the extension shortcut, then the in-page button if one is needed.
        With a declared (lab-only) injection the button is already on the page."""
        if not declared:
            with self.d.context(self.d.CONTEXT_CHROME):
                ActionChains(self.d).key_down(Keys.ALT).key_down(Keys.SHIFT).send_keys("p").key_up(Keys.SHIFT).key_up(Keys.ALT).perform()
        time.sleep(1.5)
        if not self.pip_handles():
            self.d.switch_to.window(self.main)
            v = self.d.find_element(By.CSS_SELECTOR, video_css)
            r = v.rect
            ActionChains(self.d).move_to_element_with_offset(v, int(r["width"] / 2 - 120), int(-r["height"] / 2 + 30)).click().perform()
        pip = self.wait(lambda: self.pip_handles(), timeout=8)
        return pip[-1] if pip else None

    def youtube_flow(self):
        """V1C-123: chapters from the YouTube adapter, clean idle view, in-page navigation."""
        out = {"url": self.args.youtube}
        self.d.switch_to.window(self.main)
        self.d.get(self.args.youtube)
        time.sleep(7)
        self.js("document.querySelector('video')?.play()")
        time.sleep(2)
        pip = self.open_with_shortcut("#movie_player video", self.args.declare)
        if not pip:
            out["error"] = "no PiP window"
            self.record("youtube", **out)
            return
        time.sleep(2.5)
        self.d.switch_to.window(pip)
        out["idleChrome"] = self.js("return document.querySelector('[data-chrome]')?.dataset.chrome")
        out["idlePanelOpen"] = self.js("return !!document.querySelector('[aria-label=\"BetterPiP tools\"]')")
        out["idleShot"] = self.shot(pip, "yt-1-idle")
        label = "return document.querySelector('[aria-label^=\"Chapter:\"]')?.getAttribute('aria-label')"
        out["chapterLabel"] = self.wait(lambda: self.js(label), timeout=8)
        media = "const v = document.querySelector('video'); return v && {t: +v.currentTime.toFixed(1), d: v.duration, rs: v.readyState, paused: v.paused, ad: !!v.closest('.ad-showing')}"
        out["mediaBeforeSeek"] = self.js(media)
        out["seekMarks"] = self.js("return document.querySelectorAll('.bp-range + span, .relative > span.absolute').length")
        # Jump into a later chapter and read the label again.
        ActionChains(self.d).send_keys("t").perform()
        time.sleep(0.6)
        items = self.js("return [...document.querySelectorAll('section[aria-label=\"BetterPiP tools\"] ol li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())")
        out["panelChapters"] = {"count": len(items or []), "first": (items or [])[:3]}
        if items and len(items) > 2:
            self.d.find_elements(By.CSS_SELECTOR, "section[aria-label='BetterPiP tools'] ol li button")[2].click()
            time.sleep(1.2)
            out["labelAfterChapterClick"] = self.js(label)
            samples = []
            for _ in range(5):
                samples.append(self.js(media))
                time.sleep(1.5)
            out["mediaAfterChapterClick"] = samples
            out["labelAfterChapterSettled"] = self.js(label)
        ActionChains(self.d).move_to_element(self.d.find_element(By.TAG_NAME, "body")).perform()
        time.sleep(0.4)
        out["hoverChrome"] = self.js("return document.querySelector('[data-chrome]')?.dataset.chrome")
        out["panelShot"] = self.shot(pip, "yt-2-chapters")
        # In-page navigation to another video while the PiP is open.
        self.d.switch_to.window(self.main)
        cur = self.js("return new URL(location.href).searchParams.get('v')")
        nxt = self.js("return [...document.querySelectorAll('a[href^=\"/watch\"]')].map(a => a.href).find(h => !h.includes(arguments[0]))", cur)
        out["navigateTo"] = nxt
        if nxt:
            self.js("[...document.querySelectorAll('a[href^=\"/watch\"]')].find(a => a.href === arguments[0]).click()", nxt)
            time.sleep(8)
            out["urlAfterNav"] = self.js("return location.href")
            # Page-side truth for comparison (Marionette scripts see page globals directly).
            out["pageChaptersAfterNav"] = self.js("""try { const d = document.querySelector('ytd-watch-flexy').data;
                const mm = d.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap;
                return {video: d.currentVideoEndpoint.watchEndpoint.videoId, keys: mm.map(m => m.key), count: mm[0].value.chapters.length}; }
                catch (e) { return {error: String(e).slice(0, 120)}; }""")
            if pip in self.d.window_handles:
                self.d.switch_to.window(pip)
                items2 = self.js("return [...document.querySelectorAll('section[aria-label=\"BetterPiP tools\"] ol li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())")
                out["panelChaptersAfterNav"] = {"count": len(items2 or []), "first": (items2 or [])[:3]}
                out["navShot"] = self.shot(pip, "yt-3-after-nav")
                # And back (in-page history), to a video that has chapters again.
                self.d.switch_to.window(self.main)
                self.js("history.back()")
                time.sleep(8)
                out["urlAfterBack"] = self.js("return location.href")
                self.d.switch_to.window(pip)
                items3 = self.js("return [...document.querySelectorAll('section[aria-label=\"BetterPiP tools\"] ol li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())")
                out["panelChaptersAfterBack"] = {"count": len(items3 or []), "first": (items3 or [])[:2]}
            else:
                out["pipClosedByNav"] = True
        self.record("youtube", **out)

    def all(self):
        OUT.mkdir(parents=True, exist_ok=True)
        if self.args.youtube:
            self.run("youtube", self.youtube_flow)
        else:
            self.run("preview", self.flow)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--browser", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--geckodriver", default=shutil.which("geckodriver"))
    p.add_argument("--port", type=int, default=47160)
    p.add_argument("--out", default=str(OUT))
    p.add_argument("--dev", action="store_true", help="check the dev build that tools/run.sh serves")
    p.add_argument("--declare", action="store_true", help="lab-only declared injection (Zen attach mode)")
    p.add_argument("--youtube", metavar="URL", help="check the YouTube adapter on this watch URL (needs network)")
    a = p.parse_args()
    a.headless, a.only, a.host_compositor = False, None, False
    lab = PreviewLab(a)
    try:
        lab.all()
    finally:
        lab.save()


if __name__ == "__main__":
    main()
