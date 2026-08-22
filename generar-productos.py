#!/usr/bin/env python3
"""
Genera las páginas de producto a partir de:
  - _plantilla-producto.html  (el diseño, compartido por todas)
  - productos.json            (el texto propio de cada producto)
  - catalog.json              (nombre, especie, altura, edad, precio, imagen)

Uso:
    python generar-productos.py

Crea/actualiza un archivo producto-<slug>.html por cada producto de productos.json.
No edites esos archivos a mano: se sobrescriben en cada ejecución.
"""

import html
import json
import re
import sys
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parent
PLANTILLA = BASE / "_plantilla-producto.html"
PRODUCTOS = BASE / "productos.json"
CATALOGO = BASE / "catalog.json"

CHECK_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" '
    'aria-hidden="true">\n              <path d="M20 6 9 17l-5-5" />\n            </svg>'
)

# Fondos de las tarjetas "Por qué este árbol", en orden.
FONDOS_PORQUE = [
    ("var(--pine)", "#D7E8C4"),
    ("var(--pine-light)", "#EAF3E5"),
    ("var(--pine-soft)", "#E2EFE6"),
]


def leer_json(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def esc(texto):
    """Escapa texto para insertarlo como contenido HTML."""
    return html.escape(str(texto), quote=True)


IMAGENES = (".webp", ".jpg", ".jpeg", ".png", ".avif")
VIDEOS = (".mp4", ".webm", ".mov")

# El nombre del archivo define el texto alternativo, para no tener que
# escribirlo a mano. Se compara sin el prefijo numérico: "2-tronco.webp" -> "tronco"
TEXTOS_ALT = {
    "principal": "{n}",
    "frontal": "{n}, árbol completo de frente",
    "tronco": "Detalle del tronco de {n}",
    "follaje": "Detalle del follaje de {n}",
    "hoja": "Detalle de la hoja de {n}",
    "maceta": "Maceta de {n}",
    "escala": "{n} junto a un objeto que muestra su tamaño real",
    "tamano": "{n} junto a un objeto que muestra su tamaño real",
    "conjunto": "{n} junto a otros bonsáis del vivero",
    "entrega": "Cómo llega empacado {n}",
    "empaque": "Cómo llega empacado {n}",
    "raiz": "Detalle de la base y las raíces de {n}",
    "video": "Video de {n}",
    "giro": "Video de {n} girando",
}


def descubrir_galeria(pid, nombre):
    """Lee Images/productos/<id>/ y arma la galería sola.

    Así basta con dejar los archivos en la carpeta: no hay que declararlos.
    El orden lo da el nombre del archivo (por eso conviene 1-, 2-, 3-...).
    Un video toma como portada el archivo <mismo-nombre>-poster.<ext> si existe.
    """
    carpeta = BASE / "Images" / "productos" / pid
    if not carpeta.is_dir():
        return []

    archivos = sorted(
        (f for f in carpeta.iterdir() if f.is_file() and not f.name.startswith(".")),
        key=lambda f: f.name.lower(),
    )
    posters = {f.stem[: -len("-poster")] for f in archivos if f.stem.endswith("-poster")}

    galeria = []
    for f in archivos:
        ext = f.suffix.lower()
        if f.stem.endswith("-poster"):
            continue  # es la portada de un video, no una foto suelta

        # "2-tronco" -> "tronco"
        clave = re.sub(r"^\d+[-_]?", "", f.stem).lower()
        alt = TEXTOS_ALT.get(clave, "{n}").format(n=nombre)
        ruta = f"Images/productos/{pid}/{f.name}"

        if ext in VIDEOS:
            item = {"tipo": "video", "src": ruta, "alt": alt}
            if f.stem in posters:
                for p in archivos:
                    if p.stem == f.stem + "-poster":
                        item["poster"] = f"Images/productos/{pid}/{p.name}"
                        break
            galeria.append(item)
        elif ext in IMAGENES:
            galeria.append({"src": ruta, "alt": alt})
        else:
            print(f"  ! {f.name}: formato no soportado, se omite")

    return galeria


def bloque_galeria(producto, galeria):
    """Construye el visor + miniaturas. Si no hay fotos propias,
    usa la foto única de catalog.json."""
    if not galeria:
        galeria = [{"src": producto["imagen"], "alt": producto["nombre"]}]

    medios, miniaturas = [], []
    for i, item in enumerate(galeria):
        es_video = item.get("tipo") == "video"
        activo = i == 0
        clases = "gallery-media" + (" gallery-shot" if not es_video else "")
        if activo:
            clases += " is-active"
        oculto = "" if activo else " hidden"
        alt = esc(item.get("alt", producto["nombre"]))

        if es_video:
            poster = f' poster="{esc(item["poster"])}"' if item.get("poster") else ""
            medios.append(
                f'          <video class="{clases}" src="{esc(item["src"])}"{poster} '
                f'controls playsinline preload="metadata"{oculto}></video>'
            )
            # La miniatura del video usa el poster; si no hay, queda el ícono de play
            fondo = (
                f'<img src="{esc(item["poster"])}" alt="" loading="lazy">'
                if item.get("poster")
                else ""
            )
            miniaturas.append(
                f'          <button type="button" class="gallery-thumb is-video'
                f'{" active" if activo else ""}" aria-label="Ver video: {alt}">'
                f"{fondo}"
                f'<span class="play-badge" aria-hidden="true">'
                f'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg>'
                f"</span></button>"
            )
        else:
            carga = (
                ' loading="eager" fetchpriority="high"' if activo else ' loading="lazy"'
            )
            medios.append(
                f'          <img class="{clases}" src="{esc(item["src"])}" '
                f'alt="{alt}"{carga}{oculto}>'
            )
            miniaturas.append(
                f'          <button type="button" class="gallery-thumb'
                f'{" active" if activo else ""}" aria-label="Ver foto: {alt}">'
                f'<img src="{esc(item["src"])}" alt="" loading="lazy"></button>'
            )

    # El contador solo tiene sentido con más de un medio
    contador = (
        f'          <span class="counter"><span class="counter-actual">1</span> / {len(galeria)}</span>\n'
        if len(galeria) > 1
        else ""
    )

    # Con una sola foto mostramos el recuadro "Pronto" invitando a que haya más
    pronto = (
        '          <div class="more-slot">\n'
        '            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">\n'
        '              <line x1="12" y1="5" x2="12" y2="19" />\n'
        '              <line x1="5" y1="12" x2="19" y2="12" />\n'
        "            </svg>\n"
        "            <span>Pronto</span>\n"
        "          </div>"
        if len(galeria) == 1
        else ""
    )

    zoom = (
        '          <button type="button" class="gallery-zoom" aria-label="Ampliar foto">\n'
        '            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">\n'
        '              <circle cx="11" cy="11" r="7" />\n'
        '              <line x1="21" y1="21" x2="16.65" y2="16.65" />\n'
        '              <line x1="8" y1="11" x2="14" y2="11" />\n'
        '              <line x1="11" y1="8" x2="11" y2="14" />\n'
        "            </svg>\n"
        "          </button>"
    )

    partes = [
        '        <div class="main-shot">',
        contador.rstrip("\n") if contador else None,
        "\n".join(medios),
        zoom,
        "        </div>",
        '        <div class="thumbs">',
        "\n".join(miniaturas),
        pronto if pronto else None,
        "        </div>",
    ]
    return "\n".join(p for p in partes if p)


def bloque_beneficios(beneficios):
    partes = []
    for texto in beneficios:
        partes.append(
            f"          <li>\n            {CHECK_SVG}\n            {esc(texto)}\n          </li>"
        )
    return "\n".join(partes)


def bloque_specs(producto, specs_extra):
    filas = [
        ("Altura", producto.get("altura", "")),
        ("Edad", producto.get("edad", "")),
        ("Especie", producto.get("especie", "")),
    ]
    filas += list(specs_extra.items())
    return "\n".join(
        f"          <div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>"
        for k, v in filas
        if v
    )


def bloque_badge(badge):
    if not badge:
        return ""
    return f'          <span class="save-tag">{esc(badge)}</span>'


def bloque_porque(tarjetas):
    partes = []
    for i, tarjeta in enumerate(tarjetas):
        fondo, color_p = FONDOS_PORQUE[i % len(FONDOS_PORQUE)]
        partes.append(
            f'        <div class="why-card" style="background:{fondo}">\n'
            f'          <div class="n" style="background:var(--paper);color:var(--pine)">{i + 1:02d}</div>\n'
            f'          <h3 style="color:#F3F0E6">{esc(tarjeta["titulo"])}</h3>\n'
            f'          <p style="color:{color_p}">{esc(tarjeta["texto"])}</p>\n'
            f"        </div>"
        )
    return "\n".join(partes)


def bloque_cuidado(filas):
    partes = []
    for i, fila in enumerate(filas):
        invertida = i % 2 == 1
        clase = "care-row reverse" if invertida else "care-row"
        foto = (
            f'        <div class="care-photo">{esc(fila["foto"])}<br>(pendiente)</div>'
        )
        texto = (
            f"        <div>\n"
            f'          <span class="tag-label">{esc(fila["etiqueta"])}</span>\n'
            f"          <h3>{esc(fila['titulo'])}</h3>\n"
            f"          <p>{esc(fila['texto'])}</p>\n"
            f"        </div>"
        )
        interior = f"{texto}\n{foto}" if invertida else f"{foto}\n{texto}"
        partes.append(f'      <div class="{clase}">\n{interior}\n      </div>')
    return "\n\n".join(partes)


def bloque_relacionados(relacionados, catalogo, con_pagina):
    partes = []
    for entrada in relacionados:
        if isinstance(entrada, str):
            entrada = {"id": entrada}
        pid = entrada["id"]
        prod = catalogo.get(pid)
        if not prod:
            print(f"  ! Relacionado '{pid}' no existe en catalog.json — se omite")
            continue
        nombre = entrada.get("nombre", prod["nombre"])
        destino = con_pagina.get(pid, "index.html#catalogo")
        partes.append(
            f'        <a class="related-card" href="{esc(destino)}" style="text-decoration:none">\n'
            f'          <div class="pic"><img src="{esc(prod["imagen"])}" '
            f'alt="{esc(prod["nombre"])}" loading="lazy"></div>\n'
            f"          <strong>{esc(nombre)}</strong>\n"
            f'          <span>{esc(prod["precio"])}</span>\n'
            f"        </a>"
        )
    return "\n".join(partes)


def bloque_faq(preguntas):
    partes = []
    for i, item in enumerate(preguntas):
        abierto = " open" if i == 0 else ""
        partes.append(
            f"        <details{abierto}>\n"
            f'          <summary>{esc(item["p"])}<span class="plus"></span></summary>\n'
            f"          <p>{esc(item['r'])}</p>\n"
            f"        </details>"
        )
    return "\n".join(partes)


def generar(pid, datos, catalogo, con_pagina, plantilla):
    producto = catalogo.get(pid)
    if not producto:
        print(f"  ! '{pid}' no existe en catalog.json — se omite")
        return None

    nombre = producto["nombre"]
    precio = producto["precio"]
    archivo = con_pagina[pid]

    h1_partes = datos["h1"]
    h1 = f"{esc(h1_partes[0])} <em>{esc(h1_partes[1])}</em>" if len(h1_partes) > 1 else esc(h1_partes[0])

    eyebrow = " · ".join(
        v for v in (producto.get("especie"), producto.get("altura"), producto.get("edad")) if v
    )

    reemplazos = {
        "{{TITULO}}": esc(datos.get("titulo", nombre)),
        "{{META_DESC}}": esc(datos["metaDescripcion"]),
        "{{ARCHIVO}}": archivo,
        "{{NOMBRE}}": esc(nombre),
        "{{NOMBRE_CORTO}}": esc(datos.get("nombreCorto", nombre)),
        "{{IMAGEN}}": esc(producto["imagen"]),
        # Lo declarado a mano manda; si no, se descubre leyendo la carpeta
        "{{GALERIA}}": bloque_galeria(
            producto, datos.get("galeria") or descubrir_galeria(pid, nombre)
        ),
        "{{EYEBROW}}": esc(eyebrow),
        "{{H1}}": h1,
        "{{PRECIO}}": esc(precio),
        "{{PRECIO_NUM}}": re.sub(r"[^0-9.]", "", precio),
        "{{BENEFICIOS}}": bloque_beneficios(datos["beneficios"]),
        "{{BADGE_PRECIO}}": bloque_badge(datos.get("badgePrecio")),
        "{{SPECS}}": bloque_specs(producto, datos.get("specsExtra", {})),
        "{{RESUMEN}}": esc(datos["resumen"]),
        "{{POR_QUE}}": bloque_porque(datos["porQue"]),
        "{{CUIDADO}}": bloque_cuidado(datos["cuidado"]),
        "{{CIERRE_TITULO}}": esc(datos["cierre"]["titulo"]),
        "{{CIERRE_TEXTO}}": esc(datos["cierre"]["texto"]),
        "{{RELACIONADOS}}": bloque_relacionados(
            datos.get("relacionados", []), catalogo, con_pagina
        ),
        "{{FAQ}}": bloque_faq(datos["faq"]),
        # Literales JS seguros (json.dumps escapa comillas y acentos correctamente)
        "{{PRODUCTO_JS}}": json.dumps(datos.get("nombreCorto", nombre), ensure_ascii=False),
        "{{PRECIO_JS}}": json.dumps(precio, ensure_ascii=False),
        # Para el píxel de Meta: id del catálogo y precio numérico
        "{{ID_JS}}": json.dumps(pid, ensure_ascii=False),
    }

    salida = plantilla
    for marca, valor in reemplazos.items():
        salida = salida.replace(marca, valor)

    pendientes = re.findall(r"\{\{[A-Z_]+\}\}", salida)
    if pendientes:
        print(f"  ! Quedaron marcas sin reemplazar en {archivo}: {set(pendientes)}")

    destino = BASE / archivo
    # Solo escribimos si algo cambió, para no falsear la fecha del sitemap
    anterior = destino.read_text(encoding="utf-8") if destino.exists() else None
    cambio = anterior != salida
    if cambio:
        destino.write_text(salida, encoding="utf-8")
    return archivo, cambio


def main():
    for ruta in (PLANTILLA, PRODUCTOS, CATALOGO):
        if not ruta.exists():
            sys.exit(f"Falta el archivo {ruta.name}")

    plantilla = PLANTILLA.read_text(encoding="utf-8")
    productos = leer_json(PRODUCTOS)
    catalogo = {p["id"]: p for p in leer_json(CATALOGO)}

    paginas = {k: v for k, v in productos.items() if not k.startswith("_")}

    # Mapa id -> archivo, para que los "relacionados" enlacen a su página si existe.
    con_pagina = {
        pid: f"producto-{datos.get('slug', pid)}.html" for pid, datos in paginas.items()
    }

    print(f"Generando {len(paginas)} página(s) de producto...\n")
    creados, cambiados = [], []
    for pid, datos in paginas.items():
        resultado = generar(pid, datos, catalogo, con_pagina, plantilla)
        if resultado:
            archivo, cambio = resultado
            creados.append(archivo)
            if cambio:
                cambiados.append(archivo)
            print(f"  {'ACT' if cambio else ' = '} {archivo}")

    # Mapa que lee app.js para enlazar las tarjetas del catálogo a su página.
    solo_creados = {pid: arch for pid, arch in con_pagina.items() if arch in creados}
    (BASE / "paginas.json").write_text(
        json.dumps(solo_creados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"  OK  paginas.json ({len(solo_creados)} enlace(s))")

    escribir_sitemap(creados, cambiados)
    print("  OK  sitemap.xml")

    sin_cambio = len(creados) - len(cambiados)
    print(f"\nListo: {len(cambiados)} actualizada(s), {sin_cambio} sin cambios.")


SITIO = "https://decogarden.pages.dev/"


def escribir_sitemap(archivos, cambiados):
    """Reescribe sitemap.xml con la home + las páginas de producto.

    lastmod solo avanza para lo que realmente cambió: si le decimos a Google
    que todo se modificó en cada ejecución, deja de confiar en el dato.
    """
    hoy = date.today().isoformat()
    ruta = BASE / "sitemap.xml"

    # Fechas que ya estaban publicadas, para conservarlas
    previas = {}
    if ruta.exists():
        xml = ruta.read_text(encoding="utf-8")
        for loc, fecha in re.findall(
            r"<loc>\s*(.*?)\s*</loc>\s*<lastmod>\s*(.*?)\s*</lastmod>", xml, re.S
        ):
            previas[loc] = fecha

    def fecha_de(loc, cambio):
        if cambio or loc not in previas:
            return hoy
        return previas[loc]

    # La home no la genera este script: usamos la fecha real de index.html
    index = BASE / "index.html"
    fecha_home = (
        date.fromtimestamp(index.stat().st_mtime).isoformat() if index.exists() else hoy
    )

    urls = [(SITIO, fecha_home, "weekly", "1.0")]
    for a in sorted(archivos):
        loc = SITIO + a
        urls.append((loc, fecha_de(loc, a in cambiados), "monthly", "0.8"))

    # Páginas legales: se escriben a mano, así que su fecha sale del archivo
    for legal in ("privacidad.html", "terminos.html"):
        ruta_legal = BASE / legal
        if not ruta_legal.exists():
            continue
        loc = SITIO + legal
        fecha = date.fromtimestamp(ruta_legal.stat().st_mtime).isoformat()
        urls.append((loc, fecha, "yearly", "0.3"))

    lineas = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, fecha, freq, prio in urls:
        lineas += [
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <lastmod>{fecha}</lastmod>",
            f"    <changefreq>{freq}</changefreq>",
            f"    <priority>{prio}</priority>",
            "  </url>",
        ]
    lineas.append("</urlset>")
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
