#!/usr/bin/env python3
"""
Servidor de desarrollo que imita a Cloudflare Pages.

`python -m http.server` sirve los archivos tal cual, así que /privacidad daría
404 en local aunque en producción funcione perfectamente. Este servidor aplica
las mismas reglas que Cloudflare, para que lo que ves aquí sea lo que se publica:

    /foo         sirve foo.html
    /foo.html    308 a /foo
    /index.html  308 a /
    /foo/        308 a /foo   (solo si existe foo.html, no para carpetas reales)
    desconocido  404.html con código 404

Uso:
    python servidor.py [puerto]      # por defecto, 8435
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BASE = Path(__file__).resolve().parent
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8435


class ManejadorPages(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self._redirigido():
            super().do_GET()

    def do_HEAD(self):
        if not self._redirigido():
            super().do_HEAD()

    def end_headers(self):
        """Nada de caché mientras desarrollas.

        SimpleHTTPRequestHandler no manda Cache-Control, así que el navegador
        aplica caché heurística sobre Last-Modified y se queda con el CSS o el JS
        viejo: editas un archivo, recargas, y no ves el cambio. Esto solo afecta
        al servidor local; en Cloudflare manda _headers.
        """
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _limpiar(self, camino):
        """La forma canónica de una ruta: sin .html y sin barra final."""
        if camino.endswith("/index.html"):
            return camino[: -len("index.html")]
        if camino.endswith(".html"):
            return camino[: -len(".html")]
        if len(camino) > 1 and camino.endswith("/"):
            sin_barra = camino.rstrip("/")
            # Solo si es una página; las carpetas de verdad se dejan en paz,
            # o entraríamos en un bucle de redirecciones con el manejador base.
            if (BASE / (sin_barra.lstrip("/") + ".html")).is_file():
                return sin_barra
        return camino

    def _redirigido(self):
        """Responde con un 308 si la ruta no venía en su forma canónica."""
        partes = urlsplit(self.path)
        limpio = self._limpiar(partes.path)
        if limpio == partes.path:
            return False
        destino = urlunsplit(("", "", limpio or "/", partes.query, partes.fragment))
        self.send_response(308)
        self.send_header("Location", destino)
        self.end_headers()
        return True

    def translate_path(self, path):
        """Una ruta sin extensión se resuelve al .html del mismo nombre."""
        ruta = super().translate_path(path)
        destino = Path(ruta)
        if not destino.exists():
            con_html = Path(f"{ruta}.html")
            if con_html.is_file():
                return str(con_html)
        return ruta

    def send_error(self, code, message=None, explain=None):
        """Cloudflare devuelve 404.html en las rutas que no existen."""
        pagina = BASE / "404.html"
        if code == 404 and pagina.is_file():
            cuerpo = pagina.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(cuerpo)
            return
        super().send_error(code, message, explain)


if __name__ == "__main__":
    manejador = partial(ManejadorPages, directory=str(BASE))
    print(f"DecoGarden en http://localhost:{PUERTO}  (Ctrl+C para parar)")
    try:
        # Con hilos, como hace `python -m http.server`: los navegadores dejan
        # conexiones abiertas sin pedir nada, y un servidor de una sola conexión
        # se queda bloqueado esperándolas.
        ThreadingHTTPServer(("", PUERTO), manejador).serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
