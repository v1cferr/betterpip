"use strict";
const out = document.getElementById("out");
const show = (v) => { out.textContent = JSON.stringify(v); document.documentElement.dataset.m0Result = out.textContent; };
show({ has: "documentPictureInPicture" in window, popup: location.search.includes("popup") });

document.getElementById("open").addEventListener("click", async () => {
  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 200 });
    pip.document.body.textContent = "extension-origin PiP";
    show({ ok: true, origin: pip.origin, inner: [pip.innerWidth, pip.innerHeight] });
  } catch (e) {
    show({ ok: false, name: e?.name, message: String(e?.message ?? e) });
  }
});
