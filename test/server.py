import http.server, json, os, random, string, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
PORT = sys.argv[1] if len(sys.argv) > 1 else '8766'

# макет берёт файлы прямо из сборки, так что python build.py достаточно
JS_FILES = {
    '/us.js': os.path.join(REPO, 'sankaku-quick-actions.user.js'),
    '/bridge.js': os.path.join(REPO, 'dist', 'chrome', 'bridge.js'),
    '/bridge-mv2.js': os.path.join(REPO, 'dist', 'firefox-mv2', 'bridge.js'),
    '/core-main.js': os.path.join(REPO, 'dist', 'chrome', 'core-main.js'),
}
class H(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body, ctype):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', '*')
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        path = self.path.split('?')[0].split('#')[0]
        if path.startswith('/users/me'):
            me = {'id': 7, 'name': 'ilyuxa3211'}
            if os.path.exists(os.path.join(ROOT, 'rep_in_profile.flag')):
                me['reputation'] = 48
            return self._send(200, json.dumps(me), 'application/json')
        if path.startswith('/reputation/ranking'):
            return self._send(200, json.dumps({'users': [
                {'id': 7, 'user': {'id': 3, 'name': 'someone'}, 'reputation': 120},
                {'id': 99, 'user_id': 7, 'name': 'ilyuxa3211', 'reputation_rank': 3,
                 'reputation_week': 9, 'reputation': 48},
            ]}), 'application/json')
        if path.startswith('/posts'):
            posts = [
                {'id': str(100 + i), 'md5': 'md5%d' % i, 'total_score': 12 + i, 'vote_count': 4,
                 'fav_count': [7, 71, 0, 1234, 25600, 3][i], 'is_favorited': False,
                 'preview_url': 'http://127.0.0.1:%s/pic.svg' % PORT,
                 'user_vote': {1: 5, 3: 2}.get(i, 0)}
                for i in range(6)
            ]
            if 'id_range:' in self.path:
                want = self.path.split('id_range:')[1].split('&')[0]
                posts = [x for x in posts if x['id'] == want]
            return self._send(200, json.dumps(posts), 'application/json')
        if path.startswith('/api/me'):
            return self._send(200, json.dumps({'success': True}), 'application/json')
        if path == '/pic.svg':
            svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">'
                   '<rect width="200" height="200" fill="#555"/></svg>')
            return self._send(200, svg, 'image/svg+xml')
        if path.startswith('/api/tags'):
            import urllib.parse, time
            q = urllib.parse.parse_qs(self.path.split('?', 1)[1] if '?' in self.path else '').get('q', [''])[0].lower()
            time.sleep(0.3)
            known = [
                {'name': 'female', 'count': '40.8M', 'color': 'rgb(163, 127, 0)', 'rating': 'G'},
                {'name': 'male', 'count': '25.6M', 'color': 'rgb(163, 127, 0)', 'rating': 'G'},
                {'name': 'original work with a very long name', 'count': '7.8M', 'color': 'rgb(122, 29, 122)', 'rating': 'G'},
                {'name': 'large breasts', 'count': '3.1M', 'color': 'rgb(163, 127, 0)', 'rating': 'R15+'},
                {'name': 'smile', 'count': '2.9M', 'color': 'rgb(163, 127, 0)', 'rating': 'G'},
                {'name': 'blonde hair', 'count': '2.2M', 'color': 'rgb(163, 127, 0)', 'rating': 'G'},
                {'name': 'cat ears', 'count': '900K', 'color': 'rgb(163, 127, 0)', 'rating': 'G'},
                {'name': 'cat', 'count': '120K', 'color': 'rgb(0, 128, 96)', 'rating': 'G'},
                {'name': 'looking at mirror', 'count': '15K', 'color': 'rgb(163, 127, 0)', 'rating': 'G'},
            ]
            time.sleep(0.5)
            return self._send(200, json.dumps([t for t in known if q and (t['name'].startswith(q) or (' ' + q) in t['name'])]), 'application/json')
        if path in JS_FILES and os.path.exists(JS_FILES[path]):
            return self._send(200, open(JS_FILES[path], 'rb').read(),
                              'application/javascript; charset=utf-8')
        return self._send(200, open(os.path.join(ROOT, 'mock.html'), 'rb').read(), 'text/html; charset=utf-8')
    def do_OPTIONS(self):
        return self._send(204, b'', 'text/plain')
    def do_DELETE(self):
        if '/posts/' in self.path:
            return self._send(200, json.dumps({'success': True}), 'application/json')
        return self._send(404, '{}', 'application/json')
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        self.rfile.read(n)
        if self.path.startswith('/posts/'):
            return self._send(200, json.dumps({'success': True}), 'application/json')
        if self.path.startswith('/api/ai/autotag'):
            return self._send(200, json.dumps({'success': True, 'tags': ['a', 'b']}), 'application/json')
        if self.path.startswith('/api/posts/fail'):
            return self._send(400, json.dumps({'success': False, 'error': 'Duplicate post'}), 'application/json')
        if self.path.startswith('/api/posts'):
            if 'empty=1' in self.path:
                return self._send(204, b'', 'application/json')
            pid = ''.join(random.choice(string.ascii_letters) for _ in range(8))
            return self._send(200, json.dumps({'post': {'id': pid, 'md5': 'abc123'}}), 'application/json')
        return self._send(404, '{}', 'application/json')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
