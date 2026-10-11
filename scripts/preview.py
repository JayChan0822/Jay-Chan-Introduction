"""Preview the static website using the routes declared in vercel.json."""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def route(self):
        requested = urlsplit(self.path)
        config = json.loads((ROOT / 'vercel.json').read_text())
        for rule in config['redirects']:
            if requested.path == rule['source']:
                return self.redirect(rule['destination'], requested.query)
        for rule in config['rewrites']:
            if requested.path == rule['source'] + '/':
                return self.redirect(rule['source'], requested.query)
            if requested.path == rule['source']:
                self.path = rule['destination']
                return False
        return False

    def redirect(self, target, query):
        self.send_response(308)
        self.send_header('Location', target + ('?' + query if query else ''))
        self.send_header('Content-Length', '0')
        self.end_headers()
        return True

    def do_GET(self):
        if not self.route():
            super().do_GET()

    def do_HEAD(self):
        if not self.route():
            super().do_HEAD()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8880)
    args = parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
