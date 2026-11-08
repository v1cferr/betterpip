// Universal media discovery (ARCHITECTURE boundary 1): pick the most relevant <video> in
// the top-level document. No polling; called on user action.

export function findBestVideo(doc: Document = document): HTMLVideoElement | null {
  const candidates = Array.from(doc.querySelectorAll("video"));
  let best: HTMLVideoElement | null = null;
  let bestScore = 0;
  for (const v of candidates) {
    const r = v.getBoundingClientRect();
    const area = Math.max(0, r.width) * Math.max(0, r.height);
    if (area < 80 * 45) continue; // ignore thumbnails and hidden players
    const playing = !v.paused && !v.ended ? 4 : 1;
    const visible = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? 2 : 1;
    const score = area * playing * visible;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}
