# Site adapters

A site adapter adds what the generic media session cannot know from the `<video>` element
alone, such as chapters. Contract: [ADR 0003 §5.5](adr/0003-core-architecture.md). Jira:
[V1C-123](https://v1cferr.atlassian.net/browse/V1C-123).

Adapters provide **metadata and capabilities only**. They draw no UI, open no windows and
never drive the player; playback commands always go through the session to the element.
BetterPiP works on every page without one.

## Contract

`src/core/adapters/types.ts`:

| Member                       | Purpose                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `id`                         | Stable name, used in capability sources (`adapter:<id>`) and logs.         |
| `matches(url)`               | Cheap, synchronous host check. No DOM access.                              |
| `attach(ctx)`                | Returns a handle within 2 s, or the registry disposes it and falls back.   |
| `handle.capabilities()`      | Metadata capabilities (`chapters`, `captions`); playback ones are ignored. |
| `handle.chapters()`          | Current chapter list, sorted, in seconds.                                  |
| `handle.onChaptersChanged()` | Called when the list changes, e.g. after in-page navigation.               |
| `handle.dispose()`           | Releases everything; must not throw.                                       |

Every listener hangs off `ctx.scope.signal`, so closing the PiP window removes it. An adapter
that throws, rejects or times out is isolated by `attachAdapter` (`registry.ts`), and the
generic session keeps working.

## Adding an adapter

1. Put pure parsing in its own module (`<site>-parse.ts`) that takes plain JSON or strings
   and never throws. Malformed input gives an empty result.
2. Put page access and lifecycle in `<site>.ts`. Read page data from the isolated world
   with `wrappedJSObject`, copy out only the subtrees you need as JSON, and keep no page
   object.
3. Register it in `src/core/adapters/index.ts`.
4. Test the parser with small, hand-written fixtures in `tests/fixtures/<site>/`. Cover
   data with and without the feature, malformed data, and unknown or changed shapes. Never
   commit real page dumps; they can carry session or account data.
5. Add a browser scenario to `tests/browser/preview_lab.py` when the site can be reached
   from the lab.

Vimeo, Twitch and educational platforms are candidates for later. None is supported or
announced.

## YouTube

`src/core/adapters/youtube.ts` and `youtube-parse.ts`. Matches `www.youtube.com`,
`youtube.com` and `m.youtube.com`; chapters only on `/watch` and `/live/` pages.

Chapter sources, in order, as observed on 2026-11-08:

| Source                                                                                                 | Notes                                                      |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `playerOverlays…multiMarkersPlayerBarRenderer.markersMap`, `DESCRIPTION_CHAPTERS` then `AUTO_CHAPTERS` | What YouTube draws on its own seek bar. Primary.           |
| `engagementPanels` → `macroMarkersListRenderer`                                                        | The "In this video" panel. Fallback.                       |
| Description timestamps                                                                                 | Only under YouTube's rules: ≥ 3, first at 0:00, ascending. |

The response is taken from, newest first: the `yt-navigate-finish` event's
`detail.response.response`, the `ytd-watch-flexy` element's `data`, then
`window.ytInitialData`. A response is used only when its
`currentVideoEndpoint.watchEndpoint.videoId` matches the URL. In the lab,
`ytInitialData` still held the previous video after in-page navigation.

**Fragility.** All of these are internal YouTube structures, not a public API, and can
change without notice. When they do, the parser returns no chapters and the player keeps
working; the Chapters panel shows its empty state. Ads do not change the chapter list.

**Lab results (2026-11-08, Firefox 159 and Zen, isolated sway).** On the video the user
tested, all 16 chapters matched YouTube's own panel, and the seek bar showed 15 marks.
Clicking a chapter moved playback to its start and updated the label. Navigating in-page
to a video without chapters emptied the list, and going back restored all 16. Separately,
in the lab, YouTube did not buffer after a far seek, whether done with its own `seekTo()`
or by setting `currentTime`. That is a limitation of the automated browser, not of the
adapter.
