"""Automated M0 scenarios for V1C-120 (Firefox/Zen Document Picture-in-Picture).

Drives a real Firefox-family binary through geckodriver with a throw-away profile and the
temporary probe extension. Clicks are WebDriver input actions, which Gecko dispatches as
trusted events, so they carry transient user activation like a real click.

Usage:
  python3 run_lab.py --browser /path/to/firefox --label firefox-159 [--headless]
                     [--geckodriver PATH] [--port 47120] [--out ../out] [--only E3,E4]
                     [--youtube URL] [--hold-for-manual SECONDS]

Writes <out>/<label>-<mode>.json. Nothing here is product code.
"""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

HERE = Path(__file__).resolve().parent
LAB = HERE.parent


# ------------------------------------------------------------------ process metrics
def descendants(pid):
    """All descendant pids of pid, via /proc (Linux only)."""
    children = {}
    for d in Path("/proc").iterdir():
        if not d.name.isdigit():
            continue
        try:
            ppid = int((d / "stat").read_text().rsplit(")", 1)[1].split()[1])
        except (OSError, IndexError, ValueError):
            continue
        children.setdefault(ppid, []).append(int(d.name))
    out, stack = [], [pid]
    while stack:
        p = stack.pop()
        for c in children.get(p, []):
            out.append(c)
            stack.append(c)
    return out


def tree_sample(root):
    """CPU ticks (utime+stime) and PSS (kB) summed over the browser process tree."""
    ticks, pss, n = 0, 0, 0
    for p in descendants(root):
        try:
            fields = Path(f"/proc/{p}/stat").read_text().rsplit(")", 1)[1].split()
            ticks += int(fields[11]) + int(fields[12])
            for line in Path(f"/proc/{p}/smaps_rollup").read_text().splitlines():
                if line.startswith("Pss:"):
                    pss += int(line.split()[1])
            n += 1
        except (OSError, IndexError, ValueError):
            continue
    return ticks, pss, n


def measure(root, seconds, label):
    """Average CPU% (of one core) and end PSS over a window. Coarse by design."""
    hz = os.sysconf("SC_CLK_TCK")
    t0, (c0, _, _) = time.monotonic(), tree_sample(root)
    time.sleep(seconds)
    t1, (c1, pss, n) = time.monotonic(), tree_sample(root)
    return {"label": label, "seconds": round(t1 - t0, 2), "cpu_pct_one_core": round(100 * (c1 - c0) / hz / (t1 - t0), 1),
            "pss_mb": round(pss / 1024, 1), "processes": n}


# ------------------------------------------------------------------ harness
class Lab:
    def __init__(self, args):
        self.args = args
        self.base = f"http://127.0.0.1:{args.port}"
        self.req_log = Path(tempfile.mkstemp(prefix="m0-req-", suffix=".jsonl")[1])
        self.server = subprocess.Popen([sys.executable, str(HERE / "server.py"), str(LAB), str(args.port), str(self.req_log)])
        time.sleep(0.7)
        self.results = {"meta": self.meta(), "scenarios": {}, "perf": []}
        self.d = None

    def meta(self):
        a = self.args
        return {
            "label": a.label, "browser": a.browser, "headless": a.headless,
            "date": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "kernel": platform.release(),
            "session": os.environ.get("XDG_SESSION_TYPE"), "desktop": os.environ.get("XDG_CURRENT_DESKTOP"),
            "wayland_display": bool(os.environ.get("WAYLAND_DISPLAY")), "display": os.environ.get("DISPLAY"),
        }

    # -- driver lifecycle: one fresh profile per scenario keeps state from leaking
    def prefs(self):
        prefs = {
            "media.autoplay.default": 0,  # let the fixture play after a click
            "browser.shell.checkDefaultBrowser": False,
        }
        # Without the isolated null sink (see isolated-wayland.sh), scale the audio output to
        # zero below the DOM: video.volume and volumechange still behave normally, but
        # nothing reaches the host's speakers.
        if not os.environ.get("M0_AUDIO_SINK"):
            prefs["media.volume_scale"] = "0.0"
        return prefs

    def is_firefox_branded(self):
        """geckodriver only launches binaries whose --version says "Mozilla Firefox"."""
        env = {k: v for k, v in os.environ.items() if k != "LD_LIBRARY_PATH"}
        out = subprocess.run([self.args.browser, "--version"], capture_output=True, text=True, env=env, timeout=30).stdout
        self.results["meta"]["versionString"] = out.strip()
        return out.startswith("Mozilla Firefox")

    def start(self):
        # Chrome-context access is needed only by the toolbar/command probe (E1), test profile only.
        env = {**os.environ, "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS": "1"}
        env.pop("LD_LIBRARY_PATH", None)
        self.own_browser = None
        if self.is_firefox_branded():
            o = Options()
            o.binary_location = self.args.browser
            if self.args.headless:
                o.add_argument("-headless")
            for k, v in self.prefs().items():
                o.set_preference(k, v)
            svc = Service(executable_path=self.args.geckodriver, service_args=["--allow-system-access"], env=env)
        else:
            # Forks such as Zen: launch with a throw-away profile and Marionette, then attach.
            profile = Path(tempfile.mkdtemp(prefix="m0-profile-"))
            port = self.args.port + 1
            # zen.welcome-screen.seen: Zen's first-run screen otherwise covers the content area
            # (viewport 0x0) in a fresh profile.
            prefs = {**self.prefs(), "marionette.port": port, "zen.welcome-screen.seen": True}
            (profile / "user.js").write_text("".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n" for k, v in prefs.items()))
            cmd = [self.args.browser, "--marionette", "--remote-allow-system-access", "-no-remote", "-profile", str(profile)]
            if self.args.headless:
                cmd.append("-headless")
            self.own_browser = subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.own_profile = profile
            time.sleep(6)
            o = Options()
            svc = Service(executable_path=self.args.geckodriver, env=env,
                          service_args=["--connect-existing", "--marionette-port", str(port), "--allow-system-access"])
        self.d = webdriver.Firefox(options=o, service=svc)
        self.d.set_window_rect(x=40, y=40, width=1100, height=900)
        xpi = self.pack_extension()
        self.addon_id = self.d.install_addon(str(xpi), temporary=True)
        self.main = self.d.current_window_handle
        caps = self.d.capabilities
        self.results["meta"].update(browserName=caps.get("browserName"), browserVersion=caps.get("browserVersion"),
                                    platformName=caps.get("platformName"))
        self.browser_pid = caps.get("moz:processID") or (self.own_browser and self.own_browser.pid)
        time.sleep(1.0)

    def stop(self):
        if self.d:
            try:
                self.d.quit()
            except WebDriverException:
                pass
            self.d = None
        if getattr(self, "own_browser", None):
            self.own_browser.terminate()
            try:
                self.own_browser.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.own_browser.kill()
            shutil.rmtree(self.own_profile, ignore_errors=True)
            self.own_browser = None

    def pack_extension(self):
        out = Path(tempfile.mkdtemp(prefix="m0-xpi-")) / "probe.xpi"
        with zipfile.ZipFile(out, "w") as z:
            for f in (LAB / "extension").iterdir():
                z.write(f, f.name)
        return out

    # -- helpers
    def load(self, path="/site/index.html"):
        self.d.switch_to.window(self.main)
        self.d.get(self.base + path)
        time.sleep(1.2)

    def js(self, script, *args):
        return self.d.execute_script(script, *args)

    def m0(self, key):
        return self.js(f"return window.__m0.{key}")

    def attrs(self):
        return self.js("""const o={}; for (const a of document.documentElement.attributes)
            if (a.name.startsWith('data-m0-')) o[a.name.slice(8)] = JSON.parse(a.value); return o;""")

    def click(self, element_id, handle=None):
        self.d.switch_to.window(handle or self.main)
        el = self.d.find_element(By.ID, element_id)
        ActionChains(self.d).move_to_element(el).click().perform()

    def pip_handles(self):
        return [h for h in self.d.window_handles if h != self.main]

    def wait(self, fn, timeout=6.0, step=0.2):
        end = time.time() + timeout
        while time.time() < end:
            v = fn()
            if v:
                return v
            time.sleep(step)
        return fn()

    def media_requests(self):
        lines = [json.loads(x) for x in self.req_log.read_text().splitlines() if x.strip()]
        return [x for x in lines if x["path"].startswith("/fixtures/clock.webm")]

    def record(self, sid, **data):
        data["mediaRequestsInScenario"] = len(self.media_requests()) - self.req_mark
        audio = self.audio_stop()
        if audio is not None:
            data["audio"] = audio
        if self.compositor_enabled() and getattr(self, "browser_pid", None):
            data["compositor"] = self.compositor()
        self.results["scenarios"][sid] = data
        print(sid, json.dumps(data)[:600], flush=True)

    def run(self, sid, fn):
        if self.args.only and sid.split("-")[0] not in self.args.only and sid not in self.args.only:
            return
        try:
            self.req_mark = len(self.media_requests())
            self.browser_pid = None
            self.audio_start()
            self.start()
            fn()
        except Exception as e:  # keep going: one failed scenario is still evidence
            self.record(sid, status="ERROR", error=f"{type(e).__name__}: {e}")
        finally:
            self.stop()
            if getattr(self, "audio_proc", None) and self.audio_proc.poll() is None:
                self.audio_proc.terminate()

    # -- audio observation (only with the isolated null sink)
    AUDIO_RATE = 8000

    def audio_start(self):
        sink = os.environ.get("M0_AUDIO_SINK")
        self.audio_proc = None
        if not sink or not shutil.which("parec"):
            return
        self.audio_file = Path(tempfile.mkstemp(prefix="m0-audio-", suffix=".raw")[1])
        self.audio_proc = subprocess.Popen(["parec", "-d", sink + ".monitor", "--raw", "--format=s16le",
                                            f"--rate={self.AUDIO_RATE}", "--channels=1", str(self.audio_file)])

    def sink_inputs(self):
        """Audio streams currently playing into the isolated sink (duplicate audio => >1)."""
        sink = os.environ.get("M0_AUDIO_SINK")
        if not sink:
            return None
        sinks = subprocess.run(["pactl", "-f", "json", "list", "sinks"], capture_output=True, text=True).stdout
        idx = next((x["index"] for x in json.loads(sinks) if x["name"] == sink), None)
        inputs = json.loads(subprocess.run(["pactl", "-f", "json", "list", "sink-inputs"], capture_output=True, text=True).stdout)
        return sum(1 for x in inputs if x.get("sink") == idx)

    def audio_stop(self):
        """Envelope analysis of the recorded sink monitor.

        The fixture is a continuous 440 Hz bed plus a 50 ms 1 kHz blip every media second.
        A silence gap while playing means an interruption; blip spacing well under the
        expected 1 s / playbackRate would mean a second, out-of-phase copy of the audio.
        """
        if not getattr(self, "audio_proc", None):
            return None
        time.sleep(0.3)
        self.audio_proc.terminate()
        self.audio_proc.wait(timeout=5)
        import array
        data = array.array("h", self.audio_file.read_bytes()[: (self.audio_file.stat().st_size // 2) * 2])
        self.audio_file.unlink(missing_ok=True)
        win = self.AUDIO_RATE // 100  # 10 ms
        env = [(sum(v * v for v in data[i:i + win]) / win) ** 0.5 for i in range(0, len(data) - win, win)]
        if not env:
            return {"seconds": 0}
        peak = max(env)
        bed = sorted(env)[int(len(env) * 0.6)]  # typical level while the tone bed plays
        audible = [e > max(200, bed * 0.3) for e in env]
        first = next((i for i, a in enumerate(audible) if a), None)
        last = len(audible) - 1 - next((i for i, a in enumerate(reversed(audible)) if a), 0)
        gaps, run = [], 0
        for a in audible[first:last + 1] if first is not None else []:
            if not a:
                run += 1
            else:
                if run:
                    gaps.append(run * 10)
                run = 0
        thr = bed + (peak - bed) * 0.5
        onsets = []
        for i in range(1, len(env)):  # rising edges, debounced to one per 150 ms
            if env[i] > thr >= env[i - 1] and (not onsets or i - onsets[-1] >= 15):
                onsets.append(i)
        intervals = [round((b - a) / 100, 2) for a, b in zip(onsets, onsets[1:])]
        return {"seconds": round(len(data) / self.AUDIO_RATE, 1), "audibleSeconds": round(sum(audible) / 100, 1),
                "silenceGapsMsWhilePlaying": sorted(gaps, reverse=True)[:8], "blips": len(onsets),
                "blipIntervalsMin": min(intervals) if intervals else None, "blipIntervalsMax": max(intervals) if intervals else None,
                "blipIntervalsUnder0_5s": sum(1 for x in intervals if x < 0.5)}

    # -- compositor observation
    # "sway": the isolated headless session from isolated-wayland.sh (default when present).
    # "hyprland": the HOST desktop; only with --host-compositor, because it opens real
    # windows on the user's workspace.
    def compositor_kind(self):
        if self.args.headless:
            return None
        if os.environ.get("XDG_CURRENT_DESKTOP") == "sway-headless" and os.environ.get("SWAYSOCK"):
            return "sway"
        if self.args.host_compositor and os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
            return "hyprland"
        return None

    def compositor_enabled(self):
        return self.compositor_kind() is not None

    def compositor(self):
        """Browser-owned toplevels as the compositor sees them (floating/sticky/pinned/size)."""
        kind = self.compositor_kind()
        try:
            if kind == "hyprland":
                clients = json.loads(subprocess.run(["hyprctl", "clients", "-j"], capture_output=True, text=True, timeout=5).stdout)
                return [{"id": c.get("address"), "app_id": c.get("class"), "title": c.get("title"), "floating": c.get("floating"),
                         "pinned": c.get("pinned"), "size": c.get("size"), "xwayland": c.get("xwayland")}
                        for c in clients if c.get("pid") == self.browser_pid]
            if kind == "sway":
                tree = json.loads(subprocess.run(["swaymsg", "-t", "get_tree", "-r"], capture_output=True, text=True, timeout=5).stdout)
                out = []
                def walk(n, floating=False):
                    if n.get("pid") == self.browser_pid:
                        out.append({"id": n["id"], "app_id": n.get("app_id"), "title": n.get("name"), "floating": floating or n.get("type") == "floating_con",
                                    "sticky": n.get("sticky"), "size": [n["rect"]["width"], n["rect"]["height"]], "shell": n.get("shell")})
                    for c in n.get("nodes", []):
                        walk(c, floating)
                    for c in n.get("floating_nodes", []):
                        walk(c, True)
                walk(tree)
                return out
        except (OSError, ValueError, subprocess.TimeoutExpired) as e:
            return {"error": str(e)}
        return None

    def compositor_resize(self, win_id, w, h):
        if self.compositor_kind() == "hyprland":
            cmd = ["hyprctl", "dispatch", "resizewindowpixel", f"exact {w} {h},address:{win_id}"]
        else:
            cmd = ["swaymsg", f"[con_id={win_id}]", "resize", "set", "width", f"{w}px", "height", f"{h}px"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        return (r.stdout + r.stderr).strip()[:200]

    # ------------------------------------------------------------------ scenarios
    def e1_detect(self):
        self.load()
        self.record("E1-detect", detect=self.m0("results.detect"), noActivation=self.m0("results.noActivation"),
                    extension=self.attrs())

    def e1_context(self, sid, button, key, inner_button=None):
        def fn():
            self.load()
            self.click(button)
            res = self.wait(lambda: self.attrs().get(key))
            handles = self.pip_handles()
            click = None
            if res and res.get("ok", True) and handles and inner_button:
                self.click(inner_button, handles[-1])
                self.d.switch_to.window(self.main)
                click = self.wait(lambda: self.attrs().get(key + "-click"))
            self.record(sid, result=res, pipHandles=len(handles), innerClick=click)
        self.run(sid, fn)

    def e1_keydown(self):
        self.load()
        self.d.find_element(By.TAG_NAME, "body").click()
        ActionChains(self.d).key_down(Keys.ALT).key_down(Keys.SHIFT).send_keys("p").key_up(Keys.SHIFT).key_up(Keys.ALT).perform()
        res = self.wait(lambda: self.attrs().get("cs-keydown"))
        self.record("E1-ctx-keydown", result=res, pipHandles=len(self.pip_handles()))

    def e1_background(self):
        self.load()
        res = self.wait(lambda: self.attrs().get("bg-background-direct"))
        self.record("E1-ctx-background", result=res)

    def e1_toolbar(self):
        """Toolbar/command path. Synthetic chrome-side input; treat as indicative only."""
        self.load()
        out = {}
        try:
            self.d.switch_to.window(self.main)
            with self.d.context(self.d.CONTEXT_CHROME):
                widget = self.js("""
                  const id = arguments[0].replace(/[^a-z0-9_-]/gi, '_').toLowerCase() + '-browser-action';
                  const n = document.getElementById(id); return n ? id : null;""", self.addon_id)
                out["widgetId"] = widget
                ActionChains(self.d).key_down(Keys.ALT).key_down(Keys.SHIFT).send_keys("9").key_up(Keys.SHIFT).key_up(Keys.ALT).perform()
        except WebDriverException as e:
            out["chromeError"] = str(e).splitlines()[0]
        time.sleep(2)
        a = self.attrs()
        out.update({k: v for k, v in a.items() if k.startswith("bg-command") or k.startswith("bg-action")})
        out["pipHandles"] = len(self.pip_handles())
        self.record("E1-ctx-toolbar-command", **out)

    def e1_extension_page(self):
        self.load()
        url = self.attrs()["cs-isolated-detect"]["extensionPageUrl"]
        before = set(self.d.window_handles)
        self.click("cs-ext-page")
        tab = self.wait(lambda: list(set(self.d.window_handles) - before))[0]
        self.main = tab  # the extension page is now the "opener"
        time.sleep(1)
        self.click("open", tab)
        time.sleep(1.5)
        self.record("E1-ctx-extension-page", url=url.split("/")[-1], result=json.loads(self.js("return document.documentElement.dataset.m0Result")),
                    pipHandles=len(self.pip_handles()))

    def e1_iframe(self):
        self.load("/site/iframe.html")
        self.d.switch_to.frame(self.d.find_element(By.ID, "f"))
        ActionChains(self.d).move_to_element(self.d.find_element(By.ID, "open")).click().perform()
        self.d.switch_to.default_content()
        time.sleep(1.5)
        self.record("E1-iframe-cross-origin", frameResult=self.js("return window.__frameResult"),
                    topReadsFrameVideo=self.js("return window.__tryVideoAccess()"), pipHandles=len(self.pip_handles()))

    def e2_html(self):
        self.load()
        self.click("open-html")
        pip = self.wait(lambda: self.pip_handles())[-1]
        for _ in range(2):
            self.click("counter", pip)
        self.click("toggle", pip)
        self.d.switch_to.window(pip)
        status = self.d.find_element(By.ID, "status").text
        rect = self.d.get_window_rect()
        self.d.switch_to.window(self.main)
        ev = [e for e in self.m0("events") if e["type"].startswith(("e2:", "pip:"))]
        self.record("E2-html-window", e2=self.m0("results.e2"), statusText=status, webdriverRect=rect, events=ev)

    def open_video(self, play_seconds=3.0):
        self.load()
        self.click("play")
        time.sleep(play_seconds)
        n_before = len(self.media_requests())
        before = self.m0("snapshot()")
        self.click("open-video")
        pip = self.wait(lambda: self.pip_handles())[-1]
        time.sleep(0.5)
        return pip, n_before, before

    def e3_video(self):
        pip, n_before, before_click = self.open_video()
        e3 = self.m0("results.e3")
        streams = {"afterMove": self.sink_inputs()}
        time.sleep(3)
        during = self.m0("snapshot()")
        for b in ["bp-play", "bp-play", "bp-fwd", "bp-vol", "bp-rate"]:
            self.click(b, pip)
            time.sleep(0.6)
        self.d.switch_to.window(self.main)
        after_controls = self.m0("snapshot()")
        time.sleep(2)
        still = self.m0("snapshot()")
        # Close the PiP the way a user would (window close), then confirm the return trip.
        self.d.switch_to.window(pip)
        self.d.close()
        self.d.switch_to.window(self.main)
        time.sleep(1.5)
        restore = self.m0("results.restore")
        streams["afterReturn"] = self.sink_inputs()
        time.sleep(2)
        after_return = self.m0("snapshot()")
        n_after = len(self.media_requests())
        ev = [e for e in self.m0("events") if e["type"].startswith(("media:", "e3:", "pip:"))]
        self.record("E3-video-move", beforeClick=before_click, e3=e3, during=during, afterControls=after_controls,
                    still=still, restore=restore, afterReturn=after_return, mediaRequestsBeforeMove=n_before,
                    mediaRequestsAfterAll=n_after, audioStreamsOnSink=streams, events=ev)

    def e3_audio(self):
        """Audio continuity across move and return only: no seeks, pauses or rate changes."""
        pip, _, _ = self.open_video(play_seconds=4)
        streams = {"afterMove": self.sink_inputs()}
        time.sleep(4)
        self.d.switch_to.window(pip)
        self.d.close()
        self.d.switch_to.window(self.main)
        time.sleep(1)
        streams["afterReturn"] = self.sink_inputs()
        time.sleep(3)
        ev = [e["type"] for e in self.m0("events") if e["type"].startswith(("media:", "pip:", "e3:"))]
        self.record("E3-audio-continuity", audioStreamsOnSink=streams, media=self.m0("snapshot()"), events=ev)

    def e4_layout(self):
        pip, _, _ = self.open_video()
        out = {"modes": [], "resizes": []}
        for m in ["bp-overlay", "bp-docked", "bp-minimal", "bp-docked"]:
            self.click(m, pip)
            time.sleep(0.4)
            self.d.switch_to.window(self.main)
            out["modes"].append([e for e in self.m0("events") if e["type"] == "e4:mode"][-1])
        # Resize the PiP window from outside the page (stand-in for a user drag).
        for w, h in [(900, 420), (520, 360), (320, 240), (260, 170), (800, 450)]:
            self.d.switch_to.window(pip)
            try:
                rect = self.d.set_window_rect(width=w, height=h)
            except WebDriverException as e:
                rect = {"error": str(e).splitlines()[0]}
            time.sleep(0.6)
            self.d.switch_to.window(self.main)
            state = self.js("""const a = window.__m0.pipApi, p = a.pip, d = p.document, panel = d.getElementById('bp-panel');
                return {inner:[p.innerWidth,p.innerHeight], outer:[p.outerWidth,p.outerHeight], effective:a.effectiveMode(), video:a.videoBox(),
                        docOverflowX: d.documentElement.scrollWidth > d.documentElement.clientWidth,
                        docOverflowY: d.documentElement.scrollHeight > d.documentElement.clientHeight,
                        panelScrollable: panel.scrollHeight > panel.clientHeight, panelOverflowY: p.getComputedStyle(panel).overflowY};""")
            out["resizes"].append({"requested": [w, h], "webdriverRect": rect, **state})
        out["playback"] = self.m0("snapshot()")
        out["pipHandles"] = len(self.pip_handles())
        self.record("E4-layout", **out)

    def e5_lifecycle(self):
        out = {}
        pip, _, _ = self.open_video()
        # Tab switch in the opener window.
        self.d.switch_to.new_window("tab")
        tab2 = self.d.current_window_handle
        self.d.get(self.base + "/site/iframe.html")
        time.sleep(2)
        self.d.switch_to.window(self.main)
        out["afterTabSwitch"] = {"pipOpen": self.js("return !!window.__m0.pip && !window.__m0.pip.closed"), "media": self.m0("snapshot()"),
                                 "visibility": self.js("return document.visibilityState")}
        self.d.switch_to.window(tab2)
        self.d.close()
        # Minimize the opener window.
        self.d.switch_to.window(self.main)
        try:
            self.d.minimize_window()
            time.sleep(2)
            out["afterMinimize"] = {"pipOpen": self.js("return !!window.__m0.pip && !window.__m0.pip.closed"), "media": self.m0("snapshot()"),
                                    "handles": len(self.d.window_handles)}
            self.d.set_window_rect(x=40, y=40, width=1100, height=900)
        except WebDriverException as e:
            out["afterMinimize"] = {"error": str(e).splitlines()[0]}
        # Navigate the opener: the spec closes the PiP window.
        t0 = self.m0("snapshot()")
        self.d.get(self.base + "/site/iframe.html")
        time.sleep(1.5)
        out["afterOpenerNavigation"] = {"pipHandles": len(self.pip_handles()), "playingBefore": not t0["paused"]}
        # Re-open, then close the opener tab entirely.
        pip, _, _ = self.open_video(play_seconds=1)
        self.d.switch_to.new_window("tab")
        keeper = self.d.current_window_handle
        self.d.switch_to.window(self.main)
        self.d.close()
        time.sleep(1.5)
        out["afterOpenerClosed"] = {"remainingHandles": len(self.d.window_handles), "pipStillListed": pip in self.d.window_handles}
        self.main = keeper
        self.record("E5-lifecycle-automated", **out)

    def e5_compositor(self):
        """How the compositor manages the PiP toplevel, plus compositor-side resizes (like a drag)."""
        pip, _, _ = self.open_video()
        self.click("bp-docked", pip)
        time.sleep(0.5)
        wins = self.compositor() or []
        target = next((w for w in wins if "M0 lab" not in (w.get("title") or "")), None)
        out = {"kind": self.compositor_kind(), "windows": wins, "pipWindow": target, "resizes": []}
        if target:
            for w, h in [(900, 420), (480, 320), (280, 180), (700, 400)]:
                msg = self.compositor_resize(target["id"], w, h)
                time.sleep(0.8)
                self.d.switch_to.window(self.main)
                st = self.js("""const a = window.__m0.pipApi, p = a.pip; return {inner:[p.innerWidth,p.innerHeight], outer:[p.outerWidth,p.outerHeight], effective:a.effectiveMode(), video:a.videoBox()}""")
                now = next((x for x in (self.compositor() or []) if x["id"] == target["id"]), None)
                out["resizes"].append({"requested": [w, h], "compositorReply": msg, "compositorSize": now and now["size"], "floating": now and now["floating"], **st})
        # What a user window rule would do on a tiling Wayland compositor: float + sticky
        # (sway) / float + pin (Hyprland). Applied only to the isolated compositor.
        if target and self.compositor_kind() == "sway":
            r = subprocess.run(["swaymsg", f"[con_id={target['id']}]", "floating", "enable,", "sticky", "enable"], capture_output=True, text=True)
            out["ruleApplied"] = (r.stdout + r.stderr).strip()[:200]
            out["floatingResizes"] = []
            for w, h in [(960, 420), (520, 340), (300, 200), (240, 135), (720, 405)]:
                msg = self.compositor_resize(target["id"], w, h)
                time.sleep(0.8)
                self.d.switch_to.window(self.main)
                st = self.js("""const a = window.__m0.pipApi, p = a.pip, d = p.document; return {inner:[p.innerWidth,p.innerHeight], outer:[p.outerWidth,p.outerHeight], effective:a.effectiveMode(), video:a.videoBox(),
                    overflow: d.documentElement.scrollWidth > d.documentElement.clientWidth || d.documentElement.scrollHeight > d.documentElement.clientHeight}""")
                now = next((x for x in (self.compositor() or []) if x["id"] == target["id"]), None)
                out["floatingResizes"].append({"requested": [w, h], "compositorReply": msg, "compositor": now, **st})
        out["playback"] = self.m0("snapshot()")
        self.record("E5-compositor", **out)

    def b_native(self):
        self.load()
        self.click("play")
        time.sleep(1)
        self.click("native-pip")
        time.sleep(1.5)
        self.record("B-native-pip", result=self.m0("results.native"), handles=len(self.d.window_handles),
                    note="Native PiP is a browser-owned player window; no page HTML can be placed in it.")

    def c_popup(self):
        self.load()
        self.click("cs-popup-window")
        res = self.wait(lambda: self.attrs().get("popup-window"))
        self.record("C-popup-window", result=res, handles=len(self.d.window_handles))

    def perf(self):
        """Coarse process-tree CPU/PSS for: idle page, playing in page, playing in PiP per mode."""
        root = self.browser_pid
        if not root:
            return
        self.load()
        rows = [measure(root, 8, "page loaded, paused")]
        self.click("play")
        rows.append(measure(root, 8, "playing in page"))
        self.click("open-video")
        pip = self.wait(lambda: self.pip_handles())[-1]
        time.sleep(1)
        rows.append(measure(root, 8, "playing in PiP: minimal"))
        self.click("bp-overlay", pip)
        rows.append(measure(root, 8, "playing in PiP: overlay"))
        self.click("bp-blur", pip)
        rows.append(measure(root, 8, "playing in PiP: overlay + blur(8px)"))
        self.click("bp-blur", pip)
        self.click("bp-docked", pip)
        rows.append(measure(root, 8, "playing in PiP: docked"))
        self.d.switch_to.window(pip)
        t0 = time.monotonic()
        c0 = tree_sample(root)[0]
        for i in range(16):
            self.d.set_window_rect(width=480 + (i % 2) * 360, height=300 + (i % 2) * 150)
        c1 = tree_sample(root)[0]
        rows.append({"label": "16 programmatic resizes", "seconds": round(time.monotonic() - t0, 2),
                     "cpu_pct_one_core": round(100 * (c1 - c0) / os.sysconf("SC_CLK_TCK") / (time.monotonic() - t0), 1)})
        self.d.switch_to.window(self.main)
        rows.append({"label": "listeners", "videoListenersAddedByLab": "15 media + 6 status", "observers": 1})
        self.results["perf"] = rows
        print("perf", json.dumps(rows), flush=True)

    def youtube(self, url):
        """E6: a real player. Moves YouTube's own <video> into a PiP window and back."""
        self.d.get(url)
        time.sleep(6)
        info = {"url": url}
        info["pre"] = self.js("""const v = document.querySelector('video');
            return v ? {src: v.currentSrc.slice(0, 5), mse: v.currentSrc.startsWith('blob:'), mediaKeys: !!v.mediaKeys, paused: v.paused,
                        t: v.currentTime, inShadow: !!v.getRootNode().host} : null;""")
        # Test-only trigger: a button whose trusted click carries activation.
        self.js("""const b = document.createElement('button'); b.id = 'm0-yt'; b.textContent = 'M0 PiP';
            Object.assign(b.style, {position:'fixed', top:'70px', left:'10px', zIndex: 99999});
            b.onclick = async () => {
              const v = document.querySelector('video'); window.__yt = {log: []};
              try {
                if (v.paused) await v.play();
                const home = v.parentNode, next = v.nextSibling, t0 = v.currentTime;
                const pip = await documentPictureInPicture.requestWindow({width: 640, height: 360});
                pip.document.body.style.margin = '0';
                v.dataset.m0style = v.getAttribute('style') || '';
                v.style.cssText = 'width:100vw;height:100vh;object-fit:contain;position:static';
                pip.document.body.append(v);
                window.__yt.moved = {t0, t1: v.currentTime, paused: v.paused};
                pip.addEventListener('pagehide', () => { v.setAttribute('style', v.dataset.m0style); home.insertBefore(v, next);
                  window.__yt.returned = {t: v.currentTime, paused: v.paused, attached: v.isConnected}; });
                window.__yt.pip = pip;
              } catch (e) { window.__yt.error = e.name + ': ' + e.message; }
            };
            for (const ev of ['emptied','abort','error','loadstart','pause','play','waiting']) document.querySelector('video')
              .addEventListener(ev, () => (window.__yt?.log ?? []).push([ev, Math.round(performance.now())]));
            document.body.append(b);""")
        self.click("m0-yt")
        time.sleep(1)
        pip = self.pip_handles()
        info["moved"] = self.js("return window.__yt && {moved: window.__yt.moved, error: window.__yt.error}")
        samples = []
        for _ in range(4):
            time.sleep(2)
            samples.append(self.js("const v = window.__yt?.pip?.document.querySelector('video'); return v ? [+v.currentTime.toFixed(2), v.paused, v.readyState] : null"))
        info["samplesInPip"] = samples
        info["playerError"] = self.js("const e = document.querySelector('.ytp-error'); return e ? e.innerText.slice(0, 120) : null")
        if pip:
            self.d.switch_to.window(pip[-1])
            self.d.close()
            self.d.switch_to.window(self.main)
        time.sleep(2)
        info["returned"] = self.js("return window.__yt?.returned")
        info["afterReturn"] = self.js("const v = document.querySelector('video'); return {t: +v.currentTime.toFixed(2), paused: v.paused, readyState: v.readyState}")
        time.sleep(2)
        info["afterReturn2s"] = self.js("const v = document.querySelector('video'); return {t: +v.currentTime.toFixed(2), paused: v.paused}")
        info["mediaEvents"] = self.js("return window.__yt?.log")
        self.record("E6-youtube", **info)

    # ------------------------------------------------------------------
    def all(self):
        self.run("E1-detect", self.e1_detect)
        self.e1_context("E1-ctx-isolated", "cs-open-isolated", "cs-isolated", "cs-btn")
        self.e1_context("E1-ctx-wrapped", "cs-open-wrapped", "cs-wrapped", "cs-btn")
        self.e1_context("E1-ctx-main", "cs-open-main", "cs-main", "main-btn")
        self.e1_context("E1-ctx-isolated-move-video", "cs-move-video", "cs-move-video-state")
        self.run("E1-ctx-keydown", self.e1_keydown)
        self.run("E1-ctx-background", self.e1_background)
        self.run("E1-ctx-toolbar-command", self.e1_toolbar)
        self.run("E1-ctx-extension-page", self.e1_extension_page)
        self.run("E1-iframe-cross-origin", self.e1_iframe)
        self.run("E2-html-window", self.e2_html)
        self.run("E3-video-move", self.e3_video)
        self.run("E3-audio-continuity", self.e3_audio)
        self.run("E4-layout", self.e4_layout)
        self.run("E5-lifecycle-automated", self.e5_lifecycle)
        if self.compositor_enabled():
            self.run("E5-compositor", self.e5_compositor)
        self.run("B-native-pip", self.b_native)
        self.run("C-popup-window", self.c_popup)
        if not self.args.headless:
            self.run("PERF", self.perf)
        if self.args.youtube:
            self.run("E6-youtube", lambda: self.youtube(self.args.youtube))

    def save(self):
        out = Path(self.args.out)
        out.mkdir(parents=True, exist_ok=True)
        path = out / f"{self.args.label}-{'headless' if self.args.headless else 'headed'}.json"
        path.write_text(json.dumps(self.results, indent=1))
        print("saved", path)
        self.server.terminate()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--browser", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--geckodriver", default=shutil.which("geckodriver"))
    p.add_argument("--headless", action="store_true")
    p.add_argument("--port", type=int, default=47120)
    p.add_argument("--out", default=str(LAB / "out"))
    p.add_argument("--only", type=lambda s: s.split(","), default=None)
    p.add_argument("--youtube")
    p.add_argument("--host-compositor", action="store_true",
                   help="observe the host Hyprland session (opens windows on the user's desktop)")
    args = p.parse_args()
    lab = Lab(args)
    try:
        lab.all()
    finally:
        lab.save()


if __name__ == "__main__":
    main()
