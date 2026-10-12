"""Start Soundbox locally; no packages required."""
import http.server
import os
import webbrowser
from pathlib import Path
os.chdir(Path(__file__).resolve().parent)
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
try:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
except OSError:
    print('Port 8765 is already in use. If Soundbox is already running, open http://localhost:8765')
    raise SystemExit(1)
print('Soundbox is running at http://localhost:8765 — press Ctrl+C to stop.')
webbrowser.open('http://localhost:8765')
server.serve_forever()
