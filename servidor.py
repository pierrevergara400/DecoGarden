#!/usr/bin/env python3
"""
Servidor de desarrollo que imita a Cloudflare Pages, y backend del panel.

`python -m http.server` sirve los archivos tal cual, así que /privacidad daría
404 en local aunque en producción funcione perfectamente. Este servidor aplica
las mismas reglas que Cloudflare, para que lo que ves aquí sea lo que se publica:

    /foo         sirve foo.html
    /foo.html    308 a /foo
    /index.html  308 a /
    /foo/        308 a /foo   (solo si existe foo.html, no para carpetas reales)
    desconocido  404.html con código 404

Además atiende /api/*, que es lo que usa el panel de administración de /admin
para leer el catálogo, guardarlo y regenerar el sitio. Esa parte solo responde a
peticiones que vienen de esta misma máquina: escribe archivos y ejecuta los
generadores, así que no tiene por qué estar disponible para nadie más de la red.

Uso:
    python servidor.py [puerto]      # por defecto, 8435
"""

import json
import os
import re
import shutil
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BASE = Path(__file__).resolve().parent
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8435

CATALOGO = BASE / "catalog.json"
BLOG = BASE / "blog.json"
PRODUCTOS = BASE / "productos.json"

# Cuerpo máximo que aceptamos. El catálogo entero pesa unos 10 KB y un blog con
# cien artículos no llega a 1 MB; más que eso es un error o algo que no queremos.
MAX_CUERPO = 4 * 1024 * 1024

# Las tomas que debería tener la galería de un producto para que la ficha se
# sostenga sola. Las claves son las mismas que usa descubrir_galeria() en
# generar-productos.py: el nombre del archivo, sin el prefijo numérico.
TOMAS_ESPERADAS = [
    ("principal", "Foto principal"),
    ("perspectiva", "En perspectiva"),
    ("tronco", "Detalle del tronco"),
    ("follaje", "Detalle del follaje"),
    ("escala", "Con referencia de tamaño"),
    ("maceta", "La maceta"),
]

IMAGENES = (".webp", ".jpg", ".jpeg", ".png", ".avif")
VIDEOS = (".mp4", ".webm", ".mov")


def leer_json(ruta, por_defecto):
    if not ruta.exists():
        return por_defecto
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  ! No se pudo leer {ruta.name}: {e}")
        return por_defecto


def guardar_json(ruta, datos):
    """Guarda dejando antes una copia .bak, y sin dejar el archivo a medias.

    Escribimos a un temporal y lo movemos encima: os.replace es atómico, así
    que un corte a mitad de escritura no deja un catalog.json truncado que
    rompa la home. El .bak es el paracaídas para el otro error, el humano.
    """
    if ruta.exists():
        shutil.copy2(ruta, ruta.with_suffix(ruta.suffix + ".bak"))
    temporal = ruta.with_suffix(ruta.suffix + ".tmp")
    temporal.write_text(
        json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporal, ruta)


def auditar_fotos(pid):
    """Qué fotos tiene ya la galería de un producto y cuáles le faltan."""
    carpeta = BASE / "Images" / "productos" / pid
    if not carpeta.is_dir():
        return {
            "carpeta": f"Images/productos/{pid}/",
            "existe": False,
            "fotos": 0,
            "videos": 0,
            "tiene": [],
            "faltan": [etiqueta for _, etiqueta in TOMAS_ESPERADAS],
            "sueltas": [],
        }

    fotos = videos = 0
    claves = set()
    for f in sorted(carpeta.iterdir()):
        if not f.is_file() or f.name.startswith(".") or f.stem.endswith("-poster"):
            continue
        ext = f.suffix.lower()
        if ext in VIDEOS:
            videos += 1
        elif ext in IMAGENES:
            fotos += 1
        else:
            continue
        claves.add(re.sub(r"^\d+[-_]?", "", f.stem).lower())

    # "frontal" cumple el papel de la principal: es la foto que abre la ficha.
    if "frontal" in claves:
        claves.add("principal")

    esperadas = {clave for clave, _ in TOMAS_ESPERADAS}
    return {
        "carpeta": f"Images/productos/{pid}/",
        "existe": True,
        "fotos": fotos,
        "videos": videos,
        "tiene": [etiqueta for clave, etiqueta in TOMAS_ESPERADAS if clave in claves],
        "faltan": [etiqueta for clave, etiqueta in TOMAS_ESPERADAS if clave not in claves],
        "sueltas": sorted(c for c in claves - esperadas if c),
    }


def estado_del_sitio():
    """Todo lo que el panel necesita para pintarse, en una sola respuesta."""
    catalogo = leer_json(CATALOGO, [])
    productos = leer_json(PRODUCTOS, {})
    blog = leer_json(BLOG, {"posts": []})

    fichas = {k for k in productos if not k.startswith("_")}

    items = []
    for producto in catalogo:
        pid = producto.get("id", "")
        items.append({
            **producto,
            "activo": producto.get("activo") is not False,
            "tieneFicha": pid in fichas,
            "fotos": auditar_fotos(pid),
        })

    return {
        "productos": items,
        "blog": blog.get("posts", []) if isinstance(blog, dict) else blog,
        "tomasEsperadas": [etiqueta for _, etiqueta in TOMAS_ESPERADAS],
    }


def validar_catalogo(datos):
    """El panel no debería mandar basura, pero este archivo pinta la home."""
    if not isinstance(datos, list):
        return "El catálogo tiene que ser una lista"
    vistos = set()
    for i, producto in enumerate(datos):
        if not isinstance(producto, dict):
            return f"El elemento {i} no es un objeto"
        pid = producto.get("id")
        if not isinstance(pid, str) or not pid.strip():
            return f"El elemento {i} no tiene id"
        if pid in vistos:
            return f"Hay dos productos con el id '{pid}'"
        vistos.add(pid)
        for campo in ("nombre", "precio", "categoria", "imagen"):
            if not isinstance(producto.get(campo), str) or not producto[campo].strip():
                return f"A '{pid}' le falta {campo}"
        if producto["categoria"] not in ("entrada", "coleccion"):
            return f"La categoría de '{pid}' tiene que ser 'entrada' o 'coleccion'"
    return None


def validar_blog(datos):
    if not isinstance(datos, dict) or not isinstance(datos.get("posts"), list):
        return "El blog tiene que ser un objeto con una lista 'posts'"
    vistos = set()
    for i, post in enumerate(datos["posts"]):
        if not isinstance(post, dict):
            return f"El artículo {i} no es un objeto"
        for campo in ("slug", "titulo", "fecha"):
            if not isinstance(post.get(campo), str) or not post[campo].strip():
                return f"Al artículo {i + 1} le falta {campo}"
        if post["slug"] in vistos:
            return f"Hay dos artículos con el slug '{post['slug']}'"
        vistos.add(post["slug"])
    return None


def publicar():
    """Corre los generadores en el orden que importa y devuelve lo que dijeron.

    generar-blog.py primero: escribe los HTML del blog sin sellar. Después
    generar-productos.py, que sella los assets de todas las páginas y rehace el
    sitemap contando ya los artículos nuevos. Al revés, el blog quedaría fuera.
    """
    salida = []
    for guion in ("generar-blog.py", "generar-productos.py"):
        proceso = subprocess.run(
            [sys.executable, str(BASE / guion)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            cwd=str(BASE),
        )
        salida.append(f"$ python {guion}\n{proceso.stdout}{proceso.stderr}")
        if proceso.returncode != 0:
            return False, "\n".join(salida)
    return True, "\n".join(salida)


class ManejadorPages(SimpleHTTPRequestHandler):
    # --- API del panel ----------------------------------------------------

    def _es_local(self):
        """El panel escribe archivos y ejecuta guiones: solo desde esta máquina.

        El servidor escucha en toda la red para poder abrir la web desde el
        móvil y ver cómo queda. Eso está bien para mirar; no lo está para
        guardar. Quien no venga de localhost solo puede leer el sitio.
        """
        return self.client_address[0] in ("127.0.0.1", "::1", "localhost")

    def _json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(cuerpo)

    def _cuerpo_json(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo <= 0 or largo > MAX_CUERPO:
            raise ValueError("Cuerpo vacío o demasiado grande")
        return json.loads(self.rfile.read(largo).decode("utf-8"))

    def _api(self, ruta):
        if not self._es_local():
            self._json(403, {"error": "El panel solo funciona desde esta máquina."})
            return True

        try:
            if self.command == "GET" and ruta == "/api/estado":
                self._json(200, estado_del_sitio())
            elif self.command == "PUT" and ruta == "/api/catalogo":
                datos = self._cuerpo_json()
                error = validar_catalogo(datos)
                if error:
                    self._json(400, {"error": error})
                else:
                    guardar_json(CATALOGO, datos)
                    self._json(200, {"ok": True, "guardados": len(datos)})
            elif self.command == "PUT" and ruta == "/api/blog":
                datos = self._cuerpo_json()
                error = validar_blog(datos)
                if error:
                    self._json(400, {"error": error})
                else:
                    # El panel solo manda los artículos. Lo demás que hubiera en
                    # el archivo —el comentario que explica el formato— es de
                    # quien lo edita a mano, y guardar no es motivo para borrarlo.
                    anterior = leer_json(BLOG, {})
                    if isinstance(anterior, dict):
                        datos = {**anterior, **datos}
                    guardar_json(BLOG, datos)
                    self._json(200, {"ok": True, "guardados": len(datos["posts"])})
            elif self.command == "POST" and ruta == "/api/publicar":
                ok, registro = publicar()
                self._json(200 if ok else 500, {"ok": ok, "registro": registro})
            else:
                self._json(404, {"error": "Esa ruta de la API no existe"})
        except (ValueError, json.JSONDecodeError) as e:
            self._json(400, {"error": f"Cuerpo inválido: {e}"})
        except Exception as e:  # el panel es local: mejor ver el error que un 500 mudo
            self._json(500, {"error": f"{type(e).__name__}: {e}"})
        return True

    # --- Servidor estático ------------------------------------------------

    def do_GET(self):
        ruta = urlsplit(self.path).path
        if ruta.startswith("/api/"):
            self._api(ruta)
            return
        if not self._redirigido():
            super().do_GET()

    def do_HEAD(self):
        if not self._redirigido():
            super().do_HEAD()

    def do_PUT(self):
        ruta = urlsplit(self.path).path
        if ruta.startswith("/api/"):
            self._api(ruta)
        else:
            self.send_error(405, "Method Not Allowed")

    def do_POST(self):
        ruta = urlsplit(self.path).path
        if ruta.startswith("/api/"):
            self._api(ruta)
        else:
            self.send_error(405, "Method Not Allowed")

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
    print(f"Panel        en http://localhost:{PUERTO}/admin")
    try:
        # Con hilos, como hace `python -m http.server`: los navegadores dejan
        # conexiones abiertas sin pedir nada, y un servidor de una sola conexión
        # se queda bloqueado esperándolas.
        ThreadingHTTPServer(("", PUERTO), manejador).serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
