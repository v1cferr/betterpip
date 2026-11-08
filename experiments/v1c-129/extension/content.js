// V1C-129 probe: opens a Document PiP window whose title carries a per-session token, with
// two pin toggles ("Above others", "Follow workspaces"). Results go to data-pin-* attributes.
"use strict";

(() => {
  const report = (k, v) => document.documentElement.setAttribute("data-pin-" + k, JSON.stringify(v));
  const token = "bp-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("");
  const ask = (op, value) => browser.runtime.sendMessage({ op, token, value });
  let n = 0;

  const opener = document.createElement("button");
  opener.id = "bp-pin-open";
  opener.textContent = "V1C-129: open PiP with pin controls";
  document.body.prepend(opener);

  opener.addEventListener("click", async () => {
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 420, height: 160 });
      const d = pip.document;
      d.title = "BetterPiP " + token;
      const mk = (id, label) => {
        const b = d.createElement("button");
        b.id = id; b.type = "button"; b.textContent = label;
        b.setAttribute("aria-pressed", "false");
        d.body.append(b);
        return b;
      };
      const above = mk("pin-above", "Above others");
      const follow = mk("pin-follow", "Follow workspaces");
      const status = d.createElement("output"); status.id = "pin-status"; d.body.append(status);
      const paint = (res) => {
        if (res?.ok) {
          above.setAttribute("aria-pressed", String(res.state.above));
          follow.setAttribute("aria-pressed", String(res.state.followWorkspaces));
          status.textContent = `${res.backend}: above=${res.state.above} follow=${res.state.followWorkspaces}`;
        } else {
          // Unavailable is shown, not hidden: the reason is the UX contract in ADR 0002.
          above.disabled = follow.disabled = true;
          status.textContent = "Pin control unavailable: " + (res?.error ?? "unknown");
        }
      };
      const step = async (label, op, value) => {
        const res = await ask(op, value);
        paint(res);
        report("step-" + ++n, { label, op, value, res });
        report("last", n);
      };
      above.addEventListener("click", () => step("click above", "setAbove", above.getAttribute("aria-pressed") !== "true"));
      follow.addEventListener("click", () => step("click follow", "setFollowWorkspaces", follow.getAttribute("aria-pressed") !== "true"));
      report("open", { ok: true, token });
      // The compositor maps the window shortly after requestWindow resolves.
      setTimeout(() => step("initial", "getState"), 800);
    } catch (e) {
      report("open", { ok: false, name: e?.name, message: String(e?.message ?? e) });
    }
  });
})();
