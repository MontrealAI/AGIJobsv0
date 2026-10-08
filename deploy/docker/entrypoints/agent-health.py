"""Expose only heartbeat freshness, never the container's working directory."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import time


class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/', '/healthz'):
            self.send_error(404)
            return
        try:
            healthy = time.time() - Path('/tmp/agent-last-heartbeat').stat().st_mtime < 90
        except FileNotFoundError:
            healthy = False
        body = b'{"ready":true}\n' if healthy else b'{"ready":false}\n'
        self.send_response(200 if healthy else 503)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTTPServer(('0.0.0.0', 8081), Health).serve_forever()
