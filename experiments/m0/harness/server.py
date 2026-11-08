"""Static server for the M0 lab (V1C-120) that logs every media request.

The request log is the evidence for "no second stream": if moving the <video> into the
PiP window re-downloaded the file, a new GET (or a Range request restarting at byte 0)
would show up here after the move.

Usage: python3 server.py <root> <port> <log.jsonl>
Binds to 127.0.0.1 only; http://127.0.0.1 is a potentially trustworthy (secure) context.
"""

import json
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

# Page policies for the CSP probe (E7). "strict" is a typical locked-down site: no inline
# script or style, same-origin resources only. "tt" adds Trusted Types enforcement, which
# turns string-to-HTML sinks such as innerHTML into errors.
_STRICT = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; "
           "media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'")
CSP_POLICIES = {
    "none": None,
    "strict": _STRICT,
    "tt": _STRICT + "; require-trusted-types-for 'script'",
}


class LoggingHandler(SimpleHTTPRequestHandler):
    log_path = None

    def end_headers(self):
        # No caching, so every fetch of the fixture is visible in the log.
        self.send_header("Cache-Control", "no-store")
        # E7: /site/csp.html?csp=<name> is served with that policy as a response header.
        if self.path.startswith("/site/csp.html"):
            name = parse_qs(urlsplit(self.path).query).get("csp", ["none"])[0]
            if CSP_POLICIES.get(name):
                self.send_header("Content-Security-Policy", CSP_POLICIES[name])
        super().end_headers()

    def log_message(self, fmt, *args):  # keep stderr quiet; the JSONL log is the record
        pass

    def send_head(self):
        if self.log_path:
            entry = {
                "t": time.time(),
                "method": self.command,
                "path": self.path,
                "range": self.headers.get("Range"),
                "ua": self.headers.get("User-Agent"),
            }
            with open(self.log_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry) + "\n")
        return super().send_head()


def main():
    root, port, log_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    LoggingHandler.log_path = log_path
    # SimpleHTTPRequestHandler ignores Range and answers 200 with the whole file; Firefox
    # plays that fine, and any re-fetch still appears as a new line in the log.
    handler = partial(LoggingHandler, directory=root)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    # A browser that quits mid-download resets the connection; that is not an error here.
    server.handle_error = lambda request, address: None
    server.serve_forever()


if __name__ == "__main__":
    main()
