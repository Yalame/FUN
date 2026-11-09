"""A tiny stand-in for GitHub's gist service, for testing team sync locally.

Run:  python3 tests/mock_gist_server.py 8790
Then in the app's browser console (test only):
  localStorage['champions.v1.sync'] = JSON.stringify({owner:'Yalame', id:'test0000000000000000',
      api:'http://127.0.0.1:8790', raw:'http://127.0.0.1:8790', token:'test-key'})   // omit token = view only
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OWNER = 'Yalame'
FILE = 'champions-data.json'
KEY = 'Bearer test-key'
store = {'content': None, 'patches': 0}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b'', ctype='application/json'):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-GitHub-Api-Version')
        self.send_header('Cache-Control', 'no-store')
        if body:
            self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write('[mock-gist] ' + (fmt % args) + '\n')

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/user':
            if self.headers.get('Authorization') != KEY:
                return self._send(401, b'{"message":"Bad credentials"}')
            return self._send(200, json.dumps({'login': OWNER}).encode())
        if path == '/_state':  # test helper: how many uploads happened
            return self._send(200, json.dumps({'patches': store['patches'], 'size': len(store['content'] or '')}).encode())
        if path.startswith('/gists/'):
            if self.headers.get('Authorization') not in (None, KEY):
                return self._send(401, b'{"message":"Bad credentials"}')
            files = {FILE: {'content': store['content'], 'truncated': False}} if store['content'] is not None else {}
            return self._send(200, json.dumps({'owner': {'login': OWNER}, 'files': files}).encode())
        if path.endswith('/raw/' + FILE):
            if store['content'] is None:
                return self._send(404, b'404: Not Found', 'text/plain')
            return self._send(200, store['content'].encode(), 'text/plain; charset=utf-8')
        return self._send(404, b'{}')

    def do_PATCH(self):
        if self.headers.get('Authorization') != KEY:
            return self._send(404, b'{"message":"Not Found"}')
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        f = (body.get('files') or {}).get(FILE)
        if f and 'content' in f:
            store['content'] = f['content']
            store['patches'] += 1
        return self._send(200, b'{}')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
