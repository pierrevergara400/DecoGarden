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

import hashlib
import html
import io
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # sin Pillow se sigue publicando, con la imagen genérica
    Image = None

BASE = Path(__file__).resolve().parent
PLANTILLA = BASE / "_plantilla-producto.html"
PRODUCTOS = BASE / "productos.json"
CATALOGO = BASE / "catalog.json"

# Canal de WhatsApp del pie de página. Mientras esté vacío, la columna no se
# imprime: mejor un pie de tres columnas que un botón que no lleva a ninguna
# parte. Pega aquí la URL del canal (https://whatsapp.com/channel/...).
CANAL_WHATSAPP = "https://whatsapp.com/channel/0029Vb8QEhIAYlUGzhu3G60J"

PLANTILLA_CANAL = """      <div>
        <h4>Árboles nuevos cada temporada</h4>
        <p class="canal-texto">Sigue el canal y te aviso cuando llega un lote nuevo al vivero. No es un grupo: nadie
          ve tu número y nadie puede escribir ahí más que yo.</p>
        <a class="canal-btn" href="{url}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m0 18.15c-1.53 0-3.03-.41-4.34-1.19l-.31-.18-3.12.82.83-3.04-.2-.32a8.19 8.19 0 0 1-1.26-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23" />
          </svg>
          Seguir el canal
        </a>
      </div>
"""

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


def ruta_publica(archivo):
    """La URL con la que se anuncia un archivo, que no es su nombre en disco.

    Cloudflare Pages sirve producto-x.html en /producto-x y redirige la versión
    con extensión con un 308. Si declaramos las URLs con .html —en el canonical,
    el sitemap o los enlaces internos— estamos anunciando rutas que redirigen.
    Esta es la única función que traduce archivo -> URL: en disco los archivos
    siguen llamándose igual.

        producto-guayacan.html -> producto-guayacan
        index.html             -> ''   (para que SITIO + ruta dé la home)
    """
    if archivo == "index.html":
        return ""
    if archivo.endswith(".html"):
        return archivo[: -len(".html")]
    return archivo


IMAGENES = (".webp", ".jpg", ".jpeg", ".png", ".avif")
VIDEOS = (".mp4", ".webm", ".mov")

# El nombre del archivo define el texto alternativo, para no tener que
# escribirlo a mano. Se compara sin el prefijo numérico: "2-tronco.webp" -> "tronco"
TEXTOS_ALT = {
    "principal": "{n}",
    "frontal": "{n}, árbol completo de frente",
    "perspectiva": "{n} visto en perspectiva",
    "trasera": "{n} visto desde atrás",
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


# --- Previsualización al compartir el enlace -------------------------------
# Cuadrada porque las fotos de producto lo son: un 1200x630 le cortaría la copa
# y la maceta al árbol, que es justo lo que se quiere enseñar.
OG_DIR = BASE / "Images" / "og"
OG_LADO = 1200
OG_GENERICA = "Images/og-preview.jpg"
OG_GENERICA_LADO = 1254
# Pasado ese peso WhatsApp empieza a no renderizar la tarjeta
OG_MAX_BYTES = 300 * 1024


def foto_principal(producto, galeria):
    """La foto que abre la ficha: es la que se espera ver al compartirla."""
    for item in galeria:
        if item.get("tipo") != "video":
            return item["src"]
    return producto["imagen"]


def generar_og(pid, origen):
    """Escribe Images/og/<id>.jpg, cuadrada de 1200, para la previsualización.

    Casi todo se comparte por WhatsApp y su rastreador trata mal el WebP: si el
    og:image apuntara al archivo del catálogo, buena parte de las tarjetas
    saldrían en blanco. Por eso se genera un JPEG aparte en vez de reutilizar
    la foto que ya existe.
    """
    if Image is None:
        return None

    ruta = BASE / origen
    if not ruta.is_file():
        print(f"  ! {origen} no existe — la previsualización cae en la genérica")
        return None

    with Image.open(ruta) as original:
        im = original.convert("RGB")

    # Recorte centrado y luego escalado. Las fotos ya son casi cuadradas, así
    # que esto solo lima el borde largo.
    lado = min(im.size)
    izq = (im.width - lado) // 2
    arriba = (im.height - lado) // 2
    im = im.crop((izq, arriba, izq + lado, arriba + lado))
    im = im.resize((OG_LADO, OG_LADO), Image.LANCZOS)

    # Se baja la calidad solo si hace falta, para no degradar sin motivo
    for calidad in (88, 82, 76, 70):
        buffer = io.BytesIO()
        im.save(buffer, "JPEG", quality=calidad, optimize=True, progressive=True)
        datos = buffer.getvalue()
        if len(datos) <= OG_MAX_BYTES:
            break

    OG_DIR.mkdir(parents=True, exist_ok=True)
    destino = OG_DIR / f"{pid}.jpg"
    # Solo se escribe si cambió: si no, cada ejecución ensuciaría el diff
    if not destino.exists() or destino.read_bytes() != datos:
        destino.write_bytes(datos)
        print(f"  IMG Images/og/{pid}.jpg ({len(datos) // 1024} KB, calidad {calidad})")
    return f"Images/og/{pid}.jpg"


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

    # Flechas para pasar de un medio a otro. Con uno solo no hay a dónde ir, así que
    # no se imprimen: un control que no lleva a ninguna parte estorba más de lo que ayuda.
    flechas = (
        """          <button type="button" class="gallery-nav prev" aria-label="Foto anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button type="button" class="gallery-nav next" aria-label="Foto siguiente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>"""
        if len(galeria) > 1
        else ""
    )

    partes = [
        '        <div class="main-shot">',
        contador.rstrip("\n") if contador else None,
        "\n".join(medios),
        flechas if flechas else None,
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


# --- Reglas de envío -------------------------------------------------------
# Mismos números que ENVIO en app.js. Si cambian, cámbialos en los dos sitios.
ENVIO_COSTO = 6
ENVIO_GRATIS_DESDE = 60


def precio_num(precio):
    try:
        return float(re.sub(r"[^0-9.]", "", precio or ""))
    except ValueError:
        return 0.0


def envio_gratis(precio):
    """Una sola pieza solo viaja gratis si por sí sola pasa el umbral."""
    return precio_num(precio) >= ENVIO_GRATIS_DESDE


def etiqueta_envio(precio):
    return "Envío gratis" if envio_gratis(precio) else f"+ ${ENVIO_COSTO} de envío"


def nota_envio(precio):
    if envio_gratis(precio):
        return (
            f"Envío gratis a todo el Ecuador: este bonsái ya pasa el umbral de "
            f"${ENVIO_GRATIS_DESDE}. A domicilio en Quito, o al terminal terrestre "
            f"de tu ciudad en el resto del país."
        )
    faltan = ENVIO_GRATIS_DESDE - precio_num(precio)
    return (
        f"Envío ${ENVIO_COSTO} por pedido: a domicilio en Quito, o al terminal "
        f"terrestre de tu ciudad en el resto del país. Te faltan ${faltan:g} para "
        f"que viaje gratis, y puedes sumar otro bonsái al confirmar."
    )


VENDIDO = re.compile(r"vendid|agotad|reservad", re.I)


def nombre_corto(pid, producto, cortos):
    """El nombre que cabe en una fila del pedido, sin el "Bonsái" de adelante."""
    return cortos.get(pid) or re.sub(r"^Bons[aá]i\s+", "", producto["nombre"]).strip()


def nota_pieza(producto):
    """La línea chica bajo el nombre. Si queda una sola pieza, eso es lo que importa."""
    badge = (producto.get("badgeTexto") or "").strip()
    if badge and badge.lower() != "disponible":
        return badge
    partes = [producto.get("especie"), producto.get("altura")]
    return " · ".join(v for v in partes if v) or producto.get("detallePrecio", "")


def pieza_js(pid, producto, cortos):
    return {
        "id": pid,
        "nombre": nombre_corto(pid, producto, cortos),
        "precio": precio_num(producto["precio"]),
        "imagen": producto["imagen"],
        "nota": nota_pieza(producto),
    }


def bloque_sumables(pid, catalogo, cortos):
    """El resto del catálogo disponible, para que el pedido pueda crecer.

    Sin esto la pasarela solo sabe vender una pieza, y como diez de doce bonsáis
    valen menos que el umbral, el envío gratis sería una promesa inalcanzable:
    ningún pedido podría llegar. Van ordenados por precio; la pasarela los
    reordena en vivo para poner arriba al que cierra la brecha.
    """
    lista = [
        pieza_js(otro, prod, cortos)
        for otro, prod in catalogo.items()
        if otro != pid and not VENDIDO.search(prod.get("badgeTexto") or "")
    ]
    lista.sort(key=lambda p: p["precio"])
    return lista


def total_envio(precio):
    total = precio_num(precio) if envio_gratis(precio) else precio_num(precio) + ENVIO_COSTO
    return f"${total:g}"


def bloque_badge(badge, precio):
    """El badge manual manda; si no hay, se muestra la regla de envío."""
    if not badge:
        badge = etiqueta_envio(precio)
    clase = "save-tag" if envio_gratis(precio) else "save-tag ship-paid"
    return f'          <span class="{clase}">{esc(badge)}</span>'


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
        pagina = con_pagina.get(pid)
        if not pagina:
            # Cae al catálogo genérico: se pierde justo la intención de quien
            # hizo clic en ese árbol concreto. Vale la pena saberlo.
            print(f"  ! Relacionado '{pid}' no tiene página — su tarjeta caerá en el catálogo")
        destino = f"/{ruta_publica(pagina)}" if pagina else "/#catalogo"
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


def sellar_assets(html):
    """Le pega a cada .css y .js su huella de contenido: producto.css?v=a1b2c3d4.

    Sin esto, el navegador se queda con la copia vieja: cambias el CSS, recargas y
    no ves nada. Pasa en local y también tras un despliegue, con quien ya había
    visitado la página. Como la huella sale del contenido, la URL solo cambia
    cuando el archivo cambia de verdad, así que la caché sigue sirviendo de algo.
    """

    def reemplazo(m):
        atributo, archivo = m.group(1), m.group(2)
        ruta = BASE / archivo
        if not ruta.is_file():
            return m.group(0)
        # Normalizamos los saltos de línea antes de la huella. Con
        # core.autocrlf git escribe CRLF en Windows y LF en el clon que
        # compila Cloudflare: sin esto el mismo archivo daría dos sellos
        # distintos y cada checkout ensuciaría el diff de todas las páginas.
        contenido = ruta.read_bytes().replace(b'\r\n', b'\n')
        huella = hashlib.sha1(contenido).hexdigest()[:8]
        return f'{atributo}="{archivo}?v={huella}"'

    return re.sub(
        r'(href|src)="([^"?:]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', reemplazo, html
    )


def bloque_canal():
    """La columna del canal de WhatsApp, o nada si todavía no hay canal."""
    if not CANAL_WHATSAPP:
        return ""
    return PLANTILLA_CANAL.format(url=CANAL_WHATSAPP)


def generar(pid, datos, catalogo, con_pagina, cortos, plantilla):
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

    # Lo declarado a mano manda; si no, se descubre leyendo la carpeta
    galeria = datos.get("galeria") or descubrir_galeria(pid, nombre)
    og_imagen = generar_og(pid, foto_principal(producto, galeria))

    reemplazos = {
        "{{TITULO}}": esc(datos.get("titulo", nombre)),
        "{{OG_IMAGEN}}": og_imagen or OG_GENERICA,
        "{{OG_LADO}}": str(OG_LADO if og_imagen else OG_GENERICA_LADO),
        "{{META_DESC}}": esc(datos["metaDescripcion"]),
        "{{RUTA}}": ruta_publica(archivo),
        "{{NOMBRE}}": esc(nombre),
        "{{NOMBRE_CORTO}}": esc(datos.get("nombreCorto", nombre)),
        "{{IMAGEN}}": esc(producto["imagen"]),
        "{{GALERIA}}": bloque_galeria(producto, galeria),
        "{{EYEBROW}}": esc(eyebrow),
        "{{H1}}": h1,
        "{{PRECIO}}": esc(precio),
        "{{PRECIO_NUM}}": re.sub(r"[^0-9.]", "", precio),
        "{{BENEFICIOS}}": bloque_beneficios(datos["beneficios"]),
        "{{BADGE_PRECIO}}": bloque_badge(datos.get("badgePrecio"), precio),
        "{{ENVIO_TAG}}": esc(etiqueta_envio(precio)),
        "{{ENVIO_NOTA}}": esc(nota_envio(precio)),
        "{{ENVIO_LINEA}}": "Gratis" if envio_gratis(precio) else f"${ENVIO_COSTO}",
        "{{ENVIO_TOTAL}}": total_envio(precio),
        "{{ENVIO_VALOR}}": "0" if envio_gratis(precio) else str(ENVIO_COSTO),
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
        "{{CANAL}}": bloque_canal(),
        # Literales JS seguros (json.dumps escapa comillas y acentos correctamente)
        "{{PRODUCTO_JS}}": json.dumps(datos.get("nombreCorto", nombre), ensure_ascii=False),
        "{{ENVIO_JS}}": json.dumps(
            {"costo": ENVIO_COSTO, "gratisDesde": ENVIO_GRATIS_DESDE},
            ensure_ascii=False,
        ),
        # El pedido arranca con esta pieza y puede crecer con las demás
        "{{PIEZA_JS}}": json.dumps(pieza_js(pid, producto, cortos), ensure_ascii=False),
        "{{SUMABLES_JS}}": json.dumps(
            bloque_sumables(pid, catalogo, cortos), ensure_ascii=False
        ),
        # Para el píxel de Meta: id del catálogo y precio numérico
        "{{ID_JS}}": json.dumps(pid, ensure_ascii=False),
    }

    salida = plantilla
    for marca, valor in reemplazos.items():
        salida = salida.replace(marca, valor)

    salida = sellar_assets(salida)

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


def sellar_paginas_a_mano():
    """Sella los assets de las páginas que no genera este script.

    index.html y las legales se escriben a mano pero enlazan los mismos .css y
    .js, así que sufren el mismo problema de caché vieja — y la home es
    justamente la que más gente revisita.

    Solo escribe si el sello cambió: la fecha de modificación de estos archivos
    alimenta el lastmod del sitemap y no queremos falsearla en cada ejecución.
    """
    tocadas = []
    for ruta in sorted(BASE.glob("*.html")):
        # La plantilla no se publica, y las generadas ya pasaron por sellar_assets
        if ruta.name.startswith("_") or ruta.name.startswith("producto-"):
            continue
        antes = ruta.read_text(encoding="utf-8")
        despues = sellar_assets(antes)
        if despues != antes:
            ruta.write_text(despues, encoding="utf-8")
            tocadas.append(ruta.name)
    return tocadas


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
    # Nombre corto de cada pieza, para las filas del pedido en la pasarela.
    cortos = {
        pid: datos.get("nombreCorto")
        for pid, datos in paginas.items()
        if datos.get("nombreCorto")
    }

    creados, cambiados = [], []
    for pid, datos in paginas.items():
        resultado = generar(pid, datos, catalogo, con_pagina, cortos, plantilla)
        if resultado:
            archivo, cambio = resultado
            creados.append(archivo)
            if cambio:
                cambiados.append(archivo)
            print(f"  {'ACT' if cambio else ' = '} {archivo}")

    # Mapa que lee app.js para enlazar las tarjetas del catálogo a su página.
    solo_creados = {
        pid: f"/{ruta_publica(arch)}"
        for pid, arch in con_pagina.items()
        if arch in creados
    }
    (BASE / "paginas.json").write_text(
        json.dumps(solo_creados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"  OK  paginas.json ({len(solo_creados)} enlace(s))")

    selladas = sellar_paginas_a_mano()
    for nombre in selladas:
        print(f"  ACT {nombre} (assets sellados)")

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

    # Fechas que ya estaban publicadas, para conservarlas.
    # Los sitemaps antiguos declaraban las URLs con .html; se les quita al leer
    # para que el cambio de forma no reinicie todas las fechas de golpe.
    previas = {}
    if ruta.exists():
        xml = ruta.read_text(encoding="utf-8")
        for loc, fecha in re.findall(
            r"<loc>\s*(.*?)\s*</loc>\s*<lastmod>\s*(.*?)\s*</lastmod>", xml, re.S
        ):
            previas[loc.removesuffix(".html")] = fecha

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
        loc = SITIO + ruta_publica(a)
        urls.append((loc, fecha_de(loc, a in cambiados), "monthly", "0.8"))

    # Páginas legales: se escriben a mano, así que su fecha sale del archivo
    for legal in ("privacidad.html", "terminos.html"):
        ruta_legal = BASE / legal
        if not ruta_legal.exists():
            continue
        loc = SITIO + ruta_publica(legal)
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
