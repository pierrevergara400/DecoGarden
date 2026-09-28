"""Dónde vive cada cosa del proyecto.

Es el único archivo que conoce la estructura de carpetas: los generadores, el
servidor y los guiones de mantenimiento importan de aquí en vez de armar rutas
por su cuenta. Si una carpeta cambia de sitio, se cambia aquí y en nada más.

    public/      lo que publica Cloudflare Pages, tal cual
    datos/       las fuentes que editas tú o el panel, y que no se publican
    plantillas/  el diseño de las páginas generadas
    panel/       el panel de /admin, que solo sirve servidor.py en local
    privado/     la guía en claro, su secreto y los QR (fuera de git)
    scripts/     generadores, servidor y mantenimiento
"""

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

PUBLICO = RAIZ / "public"
DATOS = RAIZ / "datos"
PLANTILLAS = RAIZ / "plantillas"
PANEL = RAIZ / "panel"
PRIVADO = RAIZ / "privado"
SCRIPTS = RAIZ / "scripts"

# El catálogo y el mapa de páginas los lee app.js en el navegador, así que
# viven dentro de public/. El resto de los datos no sale nunca de esta máquina.
CATALOGO = PUBLICO / "data" / "catalog.json"
PAGINAS = PUBLICO / "data" / "paginas.json"
PRODUCTOS = DATOS / "productos.json"
BLOG = DATOS / "blog.json"
ENVIOS = DATOS / "envios.json"

IMAGENES_PRODUCTOS = PUBLICO / "Images" / "productos"
SITEMAP = PUBLICO / "sitemap.xml"

SITIO = "https://decogarden.pages.dev/"
