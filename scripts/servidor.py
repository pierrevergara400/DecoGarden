#!/usr/bin/env python3
"""
Servidor de desarrollo que imita a Cloudflare Pages, y backend del panel.

`python -m http.server` sirve los archivos tal cual, así que /privacidad daría
404 en local aunque en producción funcione perfectamente. Este servidor aplica
las mismas reglas que Cloudflare, para que lo que ves aquí sea lo que se publica:

Sirve public/, que es exactamente la carpeta que publica Cloudflare, más el
panel de panel/ en /admin, que no se publica nunca.

    /foo         sirve foo.html
    /foo.html    308 a /foo
    /index.html  308 a /
    /foo/        308 a /foo   (solo si existe foo.html, no para carpetas reales)
    desconocido  404.html con código 404

Además atiende /api/*, que es lo que usa el panel de administración de /admin
para leer el catálogo, guardarlo y regenerar el sitio. Esa parte solo responde a
peticiones que vienen de esta misma máquina: escribe archivos y ejecuta los
generadores, así que no tiene por qué estar disponible para nadie más de la red.

Por defecto solo escucha en esta máquina (127.0.0.1): nadie más de la red ve
el sitio ni el panel. Con --red escucha también en la red local, para abrir la
web desde el móvil y ver cómo queda; el panel sigue siendo solo tuyo.

Uso:
    python scripts/servidor.py [puerto]   # por defecto, 8435, solo esta máquina
    python scripts/servidor.py --red      # visible desde el móvil, panel cerrado
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

from rutas import (
    BLOG, CATALOGO, IMAGENES_PRODUCTOS, PANEL, PRODUCTOS, PUBLICO, RAIZ, SCRIPTS, TEST_BONSAI,
)

_args = [a for a in sys.argv[1:] if a != "--red"]
PUERTO = int(_args[0]) if _args else 8435

# A qué interfaz nos atamos. Escuchar en toda la red es cómodo para mirar la web
# desde el móvil, pero mientras esté así cualquiera del wifi puede pedir las
# páginas del sitio. Por defecto no: el servidor existe para que trabajes tú.
RED_ABIERTA = "--red" in sys.argv
INTERFAZ = "0.0.0.0" if RED_ABIERTA else "127.0.0.1"

# Los Host que aceptamos en las peticiones al panel. Un navegador manda en Host
# el nombre que tú escribiste, no la IP a la que resolvió: es la única forma de
# distinguir "localhost:8435" de un dominio de fuera que apunta a 127.0.0.1
# —el ataque se llama DNS rebinding— porque para el resto del navegador esa
# página es del mismo origen y puede mandar lo que quiera.
def _hosts_validos(puerto):
    nombres = ("localhost", "127.0.0.1", "[::1]", "::1")
    return {f"{n}:{puerto}" for n in nombres} | set(nombres)


HOSTS_PANEL = _hosts_validos(PUERTO)
ORIGENES_PANEL = {f"http://localhost:{PUERTO}", f"http://127.0.0.1:{PUERTO}"}

# Cuerpo máximo que aceptamos. El catálogo entero pesa unos 10 KB y un blog con
# cien artículos no llega a 1 MB; más que eso es un error o algo que no queremos.
MAX_CUERPO = 4 * 1024 * 1024

# Las tomas que debería tener la galería de un producto para que la ficha se
# sostenga sola. Las claves son las mismas que usa descubrir_galeria() en
# generar_productos.py: el nombre del archivo, sin el prefijo numérico.
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
    carpeta = IMAGENES_PRODUCTOS / pid
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
    test = leer_json(TEST_BONSAI, None)

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
        "test": test,
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


def validar_test(datos):
    """test-bonsai.json decide qué se le recomienda a quien hace el test.

    Lo que más importa comprobar es la luz: es el filtro de seguridad del
    motor, y una luz mal escrita ("Sol" en vez de "sol") haría que ese bonsái
    no coincidiera nunca, o peor, que el perfil pareciera válido sin serlo.
    """
    if not isinstance(datos, dict):
        return "La configuración del test tiene que ser un objeto"
    preguntas = datos.get("preguntas")
    if not isinstance(preguntas, list) or not preguntas:
        return "Faltan las preguntas del test"
    opciones = {}
    for p in preguntas:
        if not isinstance(p, dict) or not p.get("id") or not isinstance(p.get("opciones"), list):
            return "Hay una pregunta sin id u opciones"
        opciones[p["id"]] = {o.get("id") for o in p["opciones"] if isinstance(o, dict)}
    if not re.fullmatch(r"\d{8,15}", str(datos.get("whatsapp", ""))):
        return "El número de WhatsApp tiene que ir solo con dígitos y el código de país (593...)"
    ga4 = datos.get("analitica", {}).get("ga4Id", "")
    if ga4 and not re.fullmatch(r"G-[A-Z0-9]+", ga4):
        return "El ID de GA4 tiene la forma G-XXXXXXX"
    perfiles = datos.get("perfiles")
    if not isinstance(perfiles, dict):
        return "Faltan los perfiles de los bonsáis"
    listas = {
        "luz": "luz", "lugares": "lugar", "estilos": "estilo", "usos": "para",
        "ocasiones": "ocasion", "cuidado": "cuidado",
    }
    for pid, perfil in perfiles.items():
        if pid.startswith("_"):
            continue
        if not isinstance(perfil, dict):
            return f"El perfil de '{pid}' no es un objeto"
        for campo, pregunta in listas.items():
            valores = perfil.get(campo, [])
            if not isinstance(valores, list):
                return f"En '{pid}', {campo} tiene que ser una lista"
            raros = [v for v in valores if v not in opciones.get(pregunta, set())]
            if raros:
                return f"En '{pid}', {campo} tiene valores que el test no conoce: {', '.join(map(str, raros))}"
        prohibidas = [l for l in perfil.get("luz", []) if l in datos.get("lucesProhibidas", [])]
        if prohibidas:
            return (f"'{pid}' no puede marcarse para {', '.join(prohibidas)}: DecoGarden no "
                    "recomienda bonsáis para sombra ni para interior sin sol directo")
        if not perfil.get("luz"):
            return f"'{pid}' no tiene ninguna luz marcada: el test no lo recomendaría nunca"
        if perfil.get("dificultad") not in ("facil", "media", "avanzada"):
            return f"La dificultad de '{pid}' tiene que ser facil, media o avanzada"
    return None


def publicar():
    """Corre los generadores en el orden que importa y devuelve lo que dijeron.

    generar_blog.py primero: escribe los HTML del blog. Después
    generar_productos.py, que sella los assets de todas las páginas y rehace el
    sitemap contando ya los artículos nuevos. Al revés, el blog quedaría fuera.
    """
    salida = []
    for guion in ("generar_blog.py", "generar_productos.py"):
        proceso = subprocess.run(
            [sys.executable, str(SCRIPTS / guion)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            cwd=str(RAIZ),
        )
        salida.append(f"$ python scripts/{guion}\n{proceso.stdout}{proceso.stderr}")
        if proceso.returncode != 0:
            return False, "\n".join(salida)
    return True, "\n".join(salida)


class ManejadorPages(SimpleHTTPRequestHandler):
    # --- API del panel ----------------------------------------------------

    def _puede_usar_el_panel(self):
        """El panel escribe archivos y ejecuta guiones: solo desde esta máquina.

        Tres comprobaciones, porque cada una tapa un agujero distinto:

        1. La conexión viene de esta máquina. Deja fuera a cualquiera del wifi
           cuando el servidor está abierto con --red.
        2. El Host es localhost o 127.0.0.1. Sin esto, una web de fuera cuyo
           dominio resuelva a 127.0.0.1 sería, para el navegador, del mismo
           origen que el panel, y podría guardar y publicar en tu nombre.
        3. Si viene Origin, es el del panel. Cierra la puerta que deja abierta
           que POST sin cabeceras propias no dispare comprobación previa: sin
           esto, cualquier página podía hacerte regenerar el sitio.

        Lo que no intenta esto es defenderte de un programa que ya esté
        corriendo en tu equipo: quien pueda hablar con este servidor también
        puede abrir catalog.json y escribirlo directamente. Una contraseña aquí
        daría sensación de seguridad sin añadir ninguna.
        """
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return False, "El panel solo funciona desde esta máquina."
        if (self.headers.get("Host") or "").lower() not in HOSTS_PANEL:
            return False, "Entra por http://localhost:%d/admin." % PUERTO
        origen = self.headers.get("Origin")
        if origen and origen.lower() not in ORIGENES_PANEL:
            return False, "Petición de otro origen: rechazada."
        return True, None

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
        permitido, motivo = self._puede_usar_el_panel()
        if not permitido:
            self._json(403, {"error": motivo})
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
            elif self.command == "PUT" and ruta == "/api/test":
                datos = self._cuerpo_json()
                error = validar_test(datos)
                if error:
                    self._json(400, {"error": error})
                else:
                    guardar_json(TEST_BONSAI, datos)
                    self._json(200, {"ok": True})
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
            if (PUBLICO / (sin_barra.lstrip("/") + ".html")).is_file():
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
        """Una ruta sin extensión se resuelve al .html del mismo nombre.

        /admin y lo que cuelga de /admin/ salen de panel/, no de public/: el
        panel existe solo aquí, en tu máquina, y Cloudflare nunca lo ve.
        """
        camino = urlsplit(path).path
        if camino == "/admin" or camino.startswith("/admin/"):
            resto = camino[len("/admin"):].lstrip("/") or "index.html"
            destino = (PANEL / resto).resolve()
            # Igual que en el sitio, /admin/pruebas-test sirve pruebas-test.html
            if not destino.exists() and destino.with_name(destino.name + ".html").is_file():
                destino = destino.with_name(destino.name + ".html")
            # Nada de salirse de panel/ con ../
            return str(destino if destino.is_relative_to(PANEL) else PANEL / "no-existe")
        ruta = super().translate_path(path)
        destino = Path(ruta)
        if not destino.exists():
            con_html = Path(f"{ruta}.html")
            if con_html.is_file():
                return str(con_html)
        return ruta

    def send_error(self, code, message=None, explain=None):
        """Cloudflare devuelve 404.html en las rutas que no existen."""
        pagina = PUBLICO / "404.html"
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
    manejador = partial(ManejadorPages, directory=str(PUBLICO))
    print(f"DecoGarden en http://localhost:{PUERTO}  (Ctrl+C para parar)")
    print(f"Panel      en http://localhost:{PUERTO}/admin")
    if RED_ABIERTA:
        print("Red        abierta: el sitio se ve desde el wifi. El panel no.")
    else:
        print("Red        cerrada: solo esta máquina. Usa --red para el móvil.")
    try:
        # Con hilos, como hace `python -m http.server`: los navegadores dejan
        # conexiones abiertas sin pedir nada, y un servidor de una sola conexión
        # se queda bloqueado esperándolas.
        ThreadingHTTPServer((INTERFAZ, PUERTO), manejador).serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
