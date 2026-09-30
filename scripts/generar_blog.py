#!/usr/bin/env python3
"""
Genera el blog a partir de:
  - plantillas/post.html  (el diseño de un artículo)
  - plantillas/blog.html  (el diseño del índice)
  - datos/blog.json       (los artículos, con el cuerpo en Markdown)

Uso:
    python scripts/generar_blog.py

Crea/actualiza blog/<slug>.html (la URL /blog/<slug>) por artículo publicado,
más blog.html con el índice (/blog). No edites esos archivos a mano: se
sobrescriben en cada ejecución.

Este script no toca el sitemap: de eso se encarga generar_productos.py, que
recorre todas las páginas al final. El orden correcto para publicar es siempre:

    python scripts/generar_blog.py && python scripts/generar_productos.py

El panel de administración (/admin) ejecuta los dos en ese orden por ti.
"""

import html
import json
import re
import sys
from datetime import date

from rutas import BLOG, CARPETA_BLOG, PLANTILLAS, PUBLICO, SITIO
from sellado import rutas_absolutas, sellar_assets

try:
    from PIL import Image
except ImportError:  # sin Pillow, la previsualización usa la portada tal cual
    Image = None

PLANTILLA_POST = PLANTILLAS / "post.html"
PLANTILLA_INDICE = PLANTILLAS / "blog.html"

AUTOR = "DecoGarden"

MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def leer_json(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def esc(texto):
    """Escapa texto para insertarlo como contenido HTML."""
    return html.escape(str(texto), quote=True)


def fecha_larga(iso):
    """2026-09-07 -> 7 de septiembre de 2026, para que se lea como una fecha."""
    try:
        d = date.fromisoformat(iso)
    except (ValueError, TypeError):
        return iso or ""
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


# --- Markdown -------------------------------------------------------------
# Un subconjunto pequeño y deliberado: encabezados, párrafos, listas, citas,
# imágenes, enlaces, negrita, cursiva y código. Es lo que hace falta para
# escribir un artículo y nada más. Un motor completo traería dependencias y
# una superficie de escape mucho más grande que vigilar.

# Solo estos destinos: una URL http(s), una ruta del propio sitio o un ancla.
# Deja fuera javascript: y data:, que es justo por donde entraría un enlace
# capaz de ejecutar algo en la página.
ENLACE_SEGURO = re.compile(r"^(?:https?://|/|#|mailto:)")


def enlace(destino, texto):
    if not ENLACE_SEGURO.match(destino):
        print(f"  ! Enlace descartado por destino no permitido: {destino}")
        return texto
    externo = destino.startswith("http")
    extra = ' target="_blank" rel="noopener"' if externo else ""
    return f'<a href="{esc(destino)}"{extra}>{texto}</a>'


def inline(texto):
    """Aplica el marcado de una línea. El texto ya viene escapado."""
    # El código va primero: dentro de `...` no se interpreta nada más.
    trozos = []

    def guardar_codigo(m):
        trozos.append(m.group(1))
        return f"\x00{len(trozos) - 1}\x00"

    texto = re.sub(r"`([^`]+)`", guardar_codigo, texto)

    texto = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)",
                   lambda m: enlace(m.group(2), m.group(1)), texto)
    texto = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", texto)
    texto = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", texto)

    return re.sub(r"\x00(\d+)\x00",
                  lambda m: f"<code>{trozos[int(m.group(1))]}</code>", texto)


def imagen(destino, alt):
    if not ENLACE_SEGURO.match(destino) and not re.match(r"^[\w./-]+$", destino):
        print(f"  ! Imagen descartada por ruta no permitida: {destino}")
        return ""
    return (f'      <figure class="post-figura">\n'
            f'        <img src="{esc(destino)}" alt="{esc(alt)}" loading="lazy" decoding="async">\n'
            f"      </figure>")


def bloque_lista(lineas, ordenada):
    etiqueta = "ol" if ordenada else "ul"
    patron = r"^\s*\d+[.)]\s+" if ordenada else r"^\s*[-*]\s+"
    items = [
        f"        <li>{inline(esc(re.sub(patron, '', ln)))}</li>"
        for ln in lineas
    ]
    cuerpo = "\n".join(items)
    return f'      <{etiqueta} class="post-lista">\n{cuerpo}\n      </{etiqueta}>'


def md_a_html(texto):
    """Convierte el cuerpo Markdown de un artículo en HTML."""
    if not texto:
        return ""

    partes = []
    # Los bloques se separan por una línea en blanco, como en cualquier Markdown.
    for bloque in re.split(r"\n\s*\n", texto.replace("\r\n", "\n").strip()):
        lineas = [ln for ln in bloque.split("\n") if ln.strip()]
        if not lineas:
            continue
        primera = lineas[0].strip()

        if re.match(r"^-{3,}$", primera):
            partes.append('      <hr class="post-hr">')
        elif primera.startswith("#"):
            nivel = len(primera) - len(primera.lstrip("#"))
            # h1 es el título del artículo; el cuerpo empieza en h2 para no
            # romper la jerarquía que lee Google.
            nivel = min(max(nivel, 2), 4)
            texto_h = inline(esc(primera.lstrip("#").strip()))
            partes.append(f"      <h{nivel}>{texto_h}</h{nivel}>")
        elif primera.startswith(">"):
            dentro = " ".join(ln.strip().lstrip(">").strip() for ln in lineas)
            partes.append(
                f'      <blockquote class="post-cita">{inline(esc(dentro))}</blockquote>'
            )
        elif re.match(r"^\s*[-*]\s+", primera):
            partes.append(bloque_lista(lineas, ordenada=False))
        elif re.match(r"^\s*\d+[.)]\s+", primera):
            partes.append(bloque_lista(lineas, ordenada=True))
        elif re.match(r"^!\[[^\]]*\]\([^)\s]+\)$", primera):
            m = re.match(r"^!\[([^\]]*)\]\(([^)\s]+)\)$", primera)
            figura = imagen(m.group(2), m.group(1))
            if figura:
                partes.append(figura)
        else:
            # Un salto simple dentro de un párrafo es solo un salto de línea.
            cuerpo = inline(esc(" ".join(ln.strip() for ln in lineas)))
            partes.append(f"      <p>{cuerpo}</p>")

    return "\n\n".join(partes)


# --- Plantillas -----------------------------------------------------------

def esta_publicado(post):
    """Un artículo se publica salvo que esté marcado como borrador.

    Igual que en el catálogo: la ausencia del campo significa publicado, para
    que un artículo terminado no dependa de acordarse de encender una bandera.
    """
    return not post.get("borrador")


def archivo_de(post):
    return f"{CARPETA_BLOG}/{post['slug']}.html"


def ruta_publica(archivo):
    return archivo[: -len(".html")] if archivo.endswith(".html") else archivo


def tarjeta(post, titulo="h2"):
    """La tarjeta de un artículo. En /blog el título es un h2 (bajo el h1 de la
    página); en la home, un h3, porque va dentro de una sección con su h2."""
    destino = "/" + ruta_publica(archivo_de(post))
    portada = post.get("portada")
    # Sin portada va un recuadro del mismo tamaño: al lado de una tarjeta con
    # foto, una sin ella quedaba con medio hueco vacío.
    figura = (
        f'        <div class="post-card-pic">'
        f'<img src="{esc(portada)}" alt="{esc(post.get("portadaAlt", post["titulo"]))}" '
        f'loading="lazy" decoding="async"></div>\n'
        if portada else
        '        <div class="post-card-pic post-card-pic-vacia" aria-hidden="true"></div>\n'
    )
    etiquetas = "".join(
        f'<span class="post-tag">{esc(t)}</span>' for t in post.get("tags", [])
    )
    return (
        f'      <a class="post-card" href="{esc(destino)}">\n'
        f"{figura}"
        f'        <div class="post-card-cuerpo">\n'
        f'          <div class="post-card-meta">'
        f'<time datetime="{esc(post["fecha"])}">{esc(fecha_larga(post["fecha"]))}</time>'
        f"{etiquetas}</div>\n"
        f"          <{titulo}>{esc(post['titulo'])}</{titulo}>\n"
        f"          <p>{esc(post.get('resumen', ''))}</p>\n"
        f'          <span class="post-card-mas">Leer el artículo →</span>\n'
        f"        </div>\n"
        f"      </a>"
    )


def schema_articulo(post):
    """Datos estructurados: le dicen a Google que esto es un artículo y de cuándo."""
    url = SITIO + ruta_publica(archivo_de(post))
    datos = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post["titulo"],
        "description": post.get("metaDescripcion", post.get("resumen", "")),
        "datePublished": post["fecha"],
        "dateModified": post.get("actualizado", post["fecha"]),
        "author": {"@type": "Organization", "name": AUTOR, "url": SITIO},
        "publisher": {"@type": "Organization", "name": AUTOR, "url": SITIO},
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "inLanguage": "es-EC",
    }
    if post.get("portada"):
        datos["image"] = SITIO + post["portada"]
    return json.dumps(datos, ensure_ascii=False, indent=2)


OG_GENERICA = "Images/og-preview.jpg"
OG_DIR = PUBLICO / "Images" / "og"


def imagen_para_compartir(post):
    """La imagen que sale al compartir el artículo por WhatsApp o redes.

    La portada va en WebP, que pesa bastante menos en la página, pero el
    rastreador de WhatsApp trata mal el WebP y la tarjeta saldría en blanco.
    Así que de una portada WebP se saca una copia JPG en Images/og/, igual que
    hace generar_productos.py con las fichas. Una portada JPG o PNG se usa tal cual.
    """
    portada = post.get("portada")
    if not portada:
        return OG_GENERICA
    origen = PUBLICO / portada
    if not portada.lower().endswith(".webp") or Image is None or not origen.is_file():
        return portada

    destino = OG_DIR / f"blog-{post['slug']}.jpg"
    # Solo se rehace si la portada cambió: así el JPG no cambia en cada ejecución.
    if not destino.exists() or destino.stat().st_mtime < origen.stat().st_mtime:
        OG_DIR.mkdir(parents=True, exist_ok=True)
        with Image.open(origen) as im:
            im.convert("RGB").save(destino, "JPEG", quality=85, optimize=True, progressive=True)
        print(f"  IMG {destino.relative_to(PUBLICO).as_posix()} ({destino.stat().st_size // 1024} KB)")
    return destino.relative_to(PUBLICO).as_posix()


def relacionados(post, publicados):
    """Los dos artículos más recientes que no son este.

    Enlazar entre artículos reparte autoridad dentro del sitio y, sobre todo,
    da a quien terminó de leer un sitio adonde ir que no sea el botón de atrás.
    """
    otros = [p for p in publicados if p["slug"] != post["slug"]][:2]
    if not otros:
        return ""
    tarjetas = "\n".join(tarjeta(p) for p in otros)
    return (
        '    <section class="post-relacionados wrap">\n'
        "      <h2>Sigue leyendo</h2>\n"
        f'      <div class="post-grid">\n{tarjetas}\n      </div>\n'
        "    </section>"
    )


def rellenar(plantilla, reemplazos):
    salida = plantilla
    for clave, valor in reemplazos.items():
        salida = salida.replace(clave, valor)
    pendientes = set(re.findall(r"\{\{[A-Z_]+\}\}", salida))
    for hueco in sorted(pendientes):
        print(f"  ! Hueco sin rellenar en la plantilla: {hueco}")
    return salida


def escribir_si_cambia(ruta, contenido):
    """Solo escribe si algo cambió.

    La fecha de modificación de estos archivos alimenta el lastmod del sitemap;
    reescribirlos idénticos le diría a Google que el artículo cambió cuando no.

    Sellamos antes de comparar, no después: en disco los archivos están sellados,
    y comparar contra la plantilla sin sellar daría distinto siempre. Ese era el
    caso que hacía que el blog entero se reescribiera en cada publicación.
    """
    contenido = sellar_assets(contenido)
    if ruta.exists() and ruta.read_text(encoding="utf-8") == contenido:
        return False
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(contenido, encoding="utf-8")
    return True


def generar_post(post, publicados, plantilla):
    titulo_partes = post.get("h1") or [post["titulo"]]
    h1 = (
        f"{esc(titulo_partes[0])} <em>{esc(titulo_partes[1])}</em>"
        if len(titulo_partes) > 1 else esc(titulo_partes[0])
    )
    archivo = archivo_de(post)
    portada = post.get("portada")
    og = SITIO + imagen_para_compartir(post)

    salida = rellenar(plantilla, {
        "{{TITULO}}": esc(post.get("tituloSeo", post["titulo"])),
        "{{META_DESC}}": esc(post.get("metaDescripcion", post.get("resumen", ""))),
        "{{RUTA}}": ruta_publica(archivo),
        "{{H1}}": h1,
        "{{RESUMEN}}": esc(post.get("resumen", "")),
        "{{FECHA_ISO}}": esc(post["fecha"]),
        "{{FECHA_LARGA}}": esc(fecha_larga(post["fecha"])),
        "{{ACTUALIZADO_ISO}}": esc(post.get("actualizado", post["fecha"])),
        "{{TAGS}}": "".join(
            f'<span class="post-tag">{esc(t)}</span>' for t in post.get("tags", [])
        ),
        "{{PORTADA}}": (
            f'        <figure class="post-portada">'
            f'<img src="{esc(portada)}" alt="{esc(post.get("portadaAlt", post["titulo"]))}" '
            f'width="1200" height="800" fetchpriority="high" decoding="async"></figure>'
            if portada else ""
        ),
        "{{OG_IMAGEN}}": esc(og),
        "{{CUERPO}}": md_a_html(post.get("cuerpo", "")),
        "{{RELACIONADOS}}": relacionados(post, publicados),
        "{{SCHEMA}}": schema_articulo(post),
    })
    # El artículo vive en /blog/: sin esto, cada Images/... buscaría /blog/Images/...
    return archivo, escribir_si_cambia(PUBLICO / archivo, rutas_absolutas(salida))


def generar_indice(publicados, plantilla):
    if publicados:
        listado = f'      <div class="post-grid">\n' + "\n".join(
            tarjeta(p) for p in publicados
        ) + "\n      </div>"
    else:
        listado = (
            '      <p class="post-vacio">Todavía no hay artículos publicados. '
            "Vuelve pronto: aquí voy a ir dejando lo que aprendo cuidando estos árboles.</p>"
        )

    schema = json.dumps({
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": "Blog de DecoGarden",
        "url": SITIO + "blog",
        "inLanguage": "es-EC",
        "blogPost": [
            {
                "@type": "BlogPosting",
                "headline": p["titulo"],
                "url": SITIO + ruta_publica(archivo_de(p)),
                "datePublished": p["fecha"],
            }
            for p in publicados
        ],
    }, ensure_ascii=False, indent=2)

    salida = rellenar(plantilla, {"{{LISTADO}}": listado, "{{SCHEMA}}": schema})
    return "blog.html", escribir_si_cambia(PUBLICO / "blog.html", salida)


# Cuántos artículos enseña la home. Los demás, en /blog.
EN_LA_HOME = 3
HOME = PUBLICO / "index.html"
MARCAS_HOME = re.compile(r"(<!-- BLOG-HOME:INICIO -->).*?(\n\s*<!-- BLOG-HOME:FIN -->)", re.S)
SECCION_HOME = re.compile(r'<section class="blk blog-home"( hidden)? id="blog">')


def generar_home(publicados):
    """Los últimos artículos en la sección "Del blog" de la home.

    index.html se escribe a mano; de él solo tocamos lo que hay entre las
    marcas BLOG-HOME y el atributo hidden de la sección, que se pone cuando no
    hay nada publicado para no enseñar un título sobre una sección vacía.
    """
    if not HOME.is_file():
        return None
    html_home = HOME.read_text(encoding="utf-8")
    if not MARCAS_HOME.search(html_home):
        print("  ! index.html no tiene las marcas BLOG-HOME: la home queda sin blog")
        return None

    ultimos = publicados[:EN_LA_HOME]
    listado = (
        '\n        <div class="post-grid">\n'
        + "\n".join("  " + tarjeta(p, titulo="h3").replace("\n", "\n  ") for p in ultimos)
        + "\n        </div>"
        if ultimos else ""
    )
    salida = MARCAS_HOME.sub(lambda m: m.group(1) + listado + m.group(2), html_home)
    salida = SECCION_HOME.sub(
        '<section class="blk blog-home"' + ("" if ultimos else " hidden") + ' id="blog">',
        salida,
    )
    return "index.html", escribir_si_cambia(HOME, salida)


def main():
    for ruta in (PLANTILLA_POST, PLANTILLA_INDICE, BLOG):
        if not ruta.exists():
            sys.exit(f"Falta el archivo {ruta.name}")

    datos = leer_json(BLOG)
    posts = datos.get("posts", []) if isinstance(datos, dict) else datos

    vistos = set()
    for post in posts:
        if not post.get("slug") or not post.get("titulo") or not post.get("fecha"):
            sys.exit(f"Artículo incompleto (hacen falta slug, titulo y fecha): {post}")
        if post["slug"] in vistos:
            sys.exit(f"Slug repetido en blog.json: {post['slug']}")
        vistos.add(post["slug"])

    # Del más nuevo al más viejo, que es como se espera leer un blog.
    publicados = sorted(
        (p for p in posts if esta_publicado(p)),
        key=lambda p: p["fecha"],
        reverse=True,
    )
    borradores = [p for p in posts if not esta_publicado(p)]

    print(f"Generando {len(publicados)} artículo(s)"
          + (f", {len(borradores)} borrador(es)" if borradores else "") + "...\n")

    # El HTML de un borrador se retira del disco por la misma razón que el de un
    # producto oculto: si el archivo se queda, Cloudflare lo sigue sirviendo en
    # su URL y Google lo conserva indexado aunque ya no lo enlace nadie.
    for post in borradores:
        ruta = PUBLICO / archivo_de(post)
        if ruta.exists():
            ruta.unlink()
            print(f"  DEL {ruta.name} (borrador)")

    # Los artículos con la URL antigua (blog-x.html en la raíz) se retiran:
    # ahora viven en blog/, y _redirects lleva a quien llegue por la vieja.
    for vieja in sorted(PUBLICO.glob("blog-*.html")):
        vieja.unlink()
        print(f"  DEL {vieja.name} (ahora en /{CARPETA_BLOG}/)")

    plantilla_post = PLANTILLA_POST.read_text(encoding="utf-8")
    for post in publicados:
        archivo, cambio = generar_post(post, publicados, plantilla_post)
        print(f"  {'ACT' if cambio else ' = '} {archivo}")

    archivo, cambio = generar_indice(
        publicados, PLANTILLA_INDICE.read_text(encoding="utf-8")
    )
    print(f"  {'ACT' if cambio else ' = '} {archivo}")

    resultado = generar_home(publicados)
    if resultado:
        archivo, cambio = resultado
        print(f"  {'ACT' if cambio else ' = '} {archivo} (sección del blog)")

    print("\nListo. Ahora corre scripts/generar_productos.py para sellar los assets "
          "y actualizar el sitemap.")


if __name__ == "__main__":
    main()
