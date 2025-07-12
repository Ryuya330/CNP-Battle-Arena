import http.server
import socketserver
import os

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)

    def do_GET(self):
        # .jsファイルをJavaScriptモジュールとして正しく提供するための設定
        if self.path.endswith(".js"):
            self.send_response(200)
            self.send_header("Content-type", "application/javascript")
            self.end_headers()
            with open(self.path[1:], 'rb') as f:
                self.wfile.write(f.read())
        else:
            super().do_GET()

# サーバーを起動
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"サーバーをポート {PORT} で起動しています。")
    print(f"ブラウザで http://localhost:{PORT} を開いてください。")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを停止します。")
        httpd.shutdown()
