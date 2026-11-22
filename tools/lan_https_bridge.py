"""Musike LAN HTTPS bridge.
Only binds to a single private LAN IPv4 and proxies selected API paths
to the existing token-protected 127.0.0.1:4283 service.
"""
from __future__ import annotations
import http.client
import http.server
import ipaddress
import os
import pathlib
import socket
import ssl
import sys
from urllib.parse import urlsplit

APP_DATA = pathlib.Path(os.environ.get("APPDATA", str(pathlib.Path.home()/"AppData/Roaming")))/"Musike"/"data"/"lan-bridge"
CERT = APP_DATA/"peer-lan.crt"
KEY = APP_DATA/"peer-lan.key"
HOST = os.environ.get("MUSIKE_LAN_IP","192.168.0.41")
PORT = int(os.environ.get("MUSIKE_LAN_PORT","4284"))
PRIVATE_PREFIXES=("/v1/health","/v1/catalog","/v1/stream/","/v1/available/","/v1/lyrics/","/v1/sync/")
MAX_BODY=9*1024*1024

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version="HTTP/1.1"
    server_version="MusikeLAN/1"
    sys_version=""
    def log_message(self, *_args): pass # Never log pairing tokens or passwords
    def dispatch(self):
        parsed=urlsplit(self.path)
        if not any(parsed.path==p or (p.endswith("/") and parsed.path.startswith(p)) for p in PRIVATE_PREFIXES):
            return self.fail(404)
        if self.command not in ("GET","HEAD","PUT","POST","OPTIONS"):
            return self.fail(405)
        length=self.headers.get("Content-Length","0")
        try: size=int(length)
        except ValueError: return self.fail(400)
        if size<0 or size>MAX_BODY:return self.fail(413)
        body=self.rfile.read(size) if size else None
        conn=http.client.HTTPConnection("127.0.0.1",4283,timeout=25)
        try:
            headers={}
            for name in ("Authorization","Content-Type","Range","Origin","X-Musike-Pairing"):
                value=self.headers.get(name)
                if value:headers[name]=value
            conn.request(self.command,self.path,body=body,headers=headers)
            remote=conn.getresponse()
            self.send_response(remote.status)
            excluded={"connection","transfer-encoding","keep-alive","date","server"}
            for key,val in remote.getheaders():
                if key.lower() not in excluded:
                    self.send_header(key,val)
            self.send_header("Connection","close")
            self.end_headers()
            if self.command!="HEAD":
                while True:
                    chunk=remote.read(65536)
                    if not chunk:break
                    self.wfile.write(chunk)
        except (ConnectionError, TimeoutError, OSError):
            if not self.headers_sent:return self.fail(502)
        finally:
            conn.close()
            self.close_connection=True
    @property
    def headers_sent(self): return getattr(self,"_headers_buffer",None) is None
    def fail(self,status):
        body=b'{"error":"unavailable"}'
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Connection","close")
        self.end_headers()
        if self.command!="HEAD":self.wfile.write(body)
        self.close_connection=True
    do_GET=dispatch
    do_HEAD=dispatch
    do_POST=dispatch
    do_PUT=dispatch
    do_OPTIONS=dispatch

def run():
    assert ipaddress.ip_address(HOST).is_private, "LAN bridge requires a private address"
    if not CERT.is_file() or not KEY.is_file():
        raise RuntimeError("Certificates missing. Run setup script before bridge.")
    listener=http.server.ThreadingHTTPServer((HOST,PORT),Handler)
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version=ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(str(CERT),str(KEY))
    listener.socket=ctx.wrap_socket(listener.socket,server_side=True)
    listener.serve_forever(poll_interval=0.5)

if __name__=="__main__":
    run()
