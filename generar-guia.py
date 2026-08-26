#!/usr/bin/env python3
"""
Genera la guía de cuidado privada a partir de:
  - guia-fuente.md        (tu texto, en claro — NO se versiona)
  - _plantilla-guia.html  (el diseño)
  - guia-secreto.json     (el código de acceso y la sal — NO se versiona)

Produce un único archivo guia-<slug>.html en el que TODO el contenido va
cifrado con AES-256-GCM. Lo que se sube a GitHub es un bloque ilegible: ni el
texto, ni los títulos, ni el índice viajan en claro. El navegador del cliente
descifra con la clave que trae el QR en el fragmento de la URL (#k=...), que
nunca sale del navegador — no llega al servidor, ni a los logs, ni al Referer.

Uso:
    python generar-guia.py                 # genera con el secreto actual
    python generar-guia.py --nuevo-codigo  # rota el código (invalida los QR viejos)
    python generar-guia.py --fuente otra.md

Después de generar, corre `python generar-qr.py` para los QR imprimibles.
"""

import argparse
import base64
import gzip
import hashlib
import html
import json
import os
import re
import secrets
import sys
from datetime import date
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit(
        "Falta la librería de cifrado. Instálala con:\n\n"
        "    python -m pip install cryptography\n"
    )

BASE = Path(__file__).resolve().parent
FUENTE = BASE / "guia-fuente.md"
PLANTILLA = BASE / "_plantilla-guia.html"
SECRETO = BASE / "guia-secreto.json"

# Parámetros del cifrado. Si cambias ITERACIONES, cámbialo también en guia.js.
ITERACIONES = 250_000
ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sin I, L, O, 0, 1: se confunden


# ==========================================================================
#  El secreto: código de acceso, sal y slug de la URL
# ==========================================================================


def codigo_nuevo(grupos=4, largo=4):
    """Un código legible tipo A7F3-K2M9-QW4T-8HRD (~80 bits de entropía)."""
    trozos = [
        "".join(secrets.choice(ALFABETO) for _ in range(largo)) for _ in range(grupos)
    ]
    return "-".join(trozos)


def cargar_secreto(rotar=False):
    """Lee guia-secreto.json, o lo crea la primera vez.

    Este archivo NO se versiona. Es lo único que hace falta para leer la guía,
    así que guárdalo tú: si lo pierdes, tendrás que generar un código nuevo y
    reimprimir todos los QR que ya hayas repartido.
    """
    datos = {}
    if SECRETO.exists():
        datos = json.loads(SECRETO.read_text(encoding="utf-8"))

    if rotar or "codigo" not in datos:
        anterior = datos.get("codigo")
        datos["codigo"] = codigo_nuevo()
        # Sal nueva con cada código: dos guías distintas nunca comparten clave.
        datos["sal"] = base64.b64encode(secrets.token_bytes(16)).decode()
        if anterior:
            print(f"  !!  Código rotado. El anterior ({anterior}) ya no sirve.")
            print("      Los QR que repartiste con ese código dejarán de funcionar.")

    # El slug de la URL se fija una sola vez y no cambia al rotar el código:
    # si cambiara, los QR viejos apuntarían a una página inexistente.
    if "slug" not in datos:
        datos["slug"] = secrets.token_hex(4)

    datos.setdefault("sitio", "https://decogarden.pages.dev")
    SECRETO.write_text(
        json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return datos


# ==========================================================================
#  Markdown -> HTML
#
#  Un intérprete pequeño y a medida del documento, no uno de propósito
#  general: soporta exactamente lo que usa guia-fuente.md (encabezados,
#  tablas, listas, negrita, cursiva y enlaces) y nada más. Así el proyecto
#  no gana una dependencia más y el HTML de salida es exactamente el que
#  necesita el diseño, con sus clases puestas.
# ==========================================================================


def esc(texto):
    return html.escape(texto, quote=True)


def inline(texto):
    """Negrita, cursiva, código y enlaces dentro de una línea."""
    t = esc(texto)
    t = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>',
        t,
    )
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*([^*\n]+?)\*(?![*\w])", r"<em>\1</em>", t)
    return t


def slug(texto):
    """Un id de URL a partir de un título, sin el número de sección."""
    t = re.sub(r"^\s*\d+(\.\d+)*\.?\s*", "", texto).lower()
    reemplazos = str.maketrans("áéíóúüñ", "aeiouun")
    t = t.translate(reemplazos)
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:60] or "seccion"


def partir_numero(titulo):
    """Separa '4. Riego: la técnica' en ('4', 'Riego: la técnica')."""
    m = re.match(r"^\s*(\d+(?:\.\d+)*)\.?\s+(.*)$", titulo)
    return (m.group(1), m.group(2)) if m else ("", titulo.strip())


# --- Rótulos que abren una lista y le dan intención (verde / rojo) ---------
LISTA_POSITIVA = ("qué sí", "que si", "lo que sí", "lo que si", "qué necesitas")
LISTA_NEGATIVA = ("qué no", "que no", "cuándo no", "cuando no", "lo que no")

# --- Párrafos que arrancan con estas palabras se dibujan como aviso --------
AVISOS = (
    "advertencia",
    "consejo honesto",
    "el principio base",
    "nunca riegues por rutina",
    "método de inmersión",
    "la regla que reemplaza",
    "dos detalles",
    "señal de sales",
    "lo que sí es fijo",
)

# --- Secciones que se dibujan distinto (el CSS hace el resto) --------------
VARIANTES = {
    "las-8-reglas-que-salvan-el-90-de-los-bonsais": "reglas",
    "los-12-errores-que-matan-bonsais-de-primerizo": "errores",
    "tu-rutina-en-una-hoja": "rutina",
    "preguntas-frecuentes": "faq",
    "fuentes-consultadas": "fuentes",
    "tabla-de-diagnostico-rapido": "diagnostico",
}


class Bloque:
    """Un trozo de documento ya convertido a HTML, con su tipo a cuestas."""

    def __init__(self, tipo, html_, texto=""):
        self.tipo = tipo
        self.html = html_
        self.texto = texto


def tabla_html(cabeceras, filas):
    """Una tabla que en móvil se convierte en tarjetas apiladas.

    El data-label de cada celda lleva el nombre de su columna: en pantalla
    ancha se ignora, y por debajo de 720px el CSS lo imprime delante del
    valor. Es la única forma de que una tabla de 7 columnas se lea en un
    teléfono sin scroll horizontal, que es donde se va a leer esto.
    """
    th = "".join(f"<th scope=col>{inline(c)}</th>" for c in cabeceras)
    cuerpo = []
    for fila in filas:
        celdas = []
        for i, celda in enumerate(fila):
            etiqueta = esc(re.sub(r"\*\*", "", cabeceras[i])) if i < len(cabeceras) else ""
            celdas.append(f'<td data-label="{etiqueta}">{inline(celda)}</td>')
        cuerpo.append("<tr>" + "".join(celdas) + "</tr>")
    return (
        '<div class="tabla-envoltura"><table>'
        f"<thead><tr>{th}</tr></thead>"
        f'<tbody>{"".join(cuerpo)}</tbody>'
        "</table></div>"
    )


def parrafo_html(lineas):
    """Un párrafo, que según cómo empiece se dibuja de tres formas."""
    texto = " ".join(lineas).strip()
    if not texto:
        return None

    plano = re.sub(r"[*`]", "", texto).strip()

    # Rótulo que abre una lista: '**Qué NO hacer:**'
    if re.fullmatch(r"\*\*.+:\*\*", texto):
        clave = plano.lower().rstrip(":")
        clase = "rotulo"
        if any(clave.startswith(k) for k in LISTA_POSITIVA):
            clase += " rotulo--si"
        elif any(clave.startswith(k) for k in LISTA_NEGATIVA):
            clase += " rotulo--no"
        return Bloque("rotulo", f'<p class="{clase}">{inline(texto)}</p>', plano)

    # Aviso: párrafo que empieza en negrita con una de las palabras clave
    if texto.startswith("**"):
        arranque = plano.lower()
        if any(arranque.startswith(k) for k in AVISOS):
            return Bloque("aviso", f'<aside class="aviso">{inline(texto)}</aside>', plano)

    return Bloque("p", f"<p>{inline(texto)}</p>", plano)


def analizar(md):
    """Markdown -> (titulo, entradilla, [secciones]).

    Cada sección es un dict con su número, título, id, subsecciones (para el
    índice) y la lista de bloques ya convertidos a HTML.
    """
    lineas = md.replace("\r\n", "\n").split("\n")
    titulo = ""
    entradilla = []
    secciones = []
    actual = None
    buffer_p = []
    i = 0

    def cerrar_parrafo():
        nonlocal buffer_p
        if buffer_p:
            bloque = parrafo_html(buffer_p)
            if bloque:
                destino = actual["bloques"] if actual else entradilla
                destino.append(bloque)
            buffer_p = []

    while i < len(lineas):
        linea = lineas[i]
        pelada = linea.strip()

        # --- Separador horizontal: solo estructura visual, se ignora -------
        if re.fullmatch(r"-{3,}", pelada):
            cerrar_parrafo()
            i += 1
            continue

        # --- Encabezados --------------------------------------------------
        if pelada.startswith("# ") and not pelada.startswith("## "):
            cerrar_parrafo()
            titulo = pelada[2:].strip()
            i += 1
            continue

        if pelada.startswith("## "):
            cerrar_parrafo()
            crudo = pelada[3:].strip()
            numero, texto = partir_numero(crudo)
            sid = slug(crudo)
            actual = {
                "numero": numero,
                "titulo": texto,
                "id": sid,
                "variante": VARIANTES.get(sid, ""),
                "sub": [],
                "bloques": [],
            }
            secciones.append(actual)
            i += 1
            continue

        if pelada.startswith("### ") and actual:
            cerrar_parrafo()
            crudo = pelada[4:].strip()
            numero, texto = partir_numero(crudo)
            sid = f"{actual['id']}--{slug(crudo)}"
            actual["sub"].append({"id": sid, "titulo": texto, "numero": numero})
            marca = f'<span class="h3-num">{esc(numero)}</span>' if numero else ""
            actual["bloques"].append(
                Bloque(
                    "h3",
                    f'<h3 id="{sid}">{marca}<span>{inline(texto)}</span>'
                    f'<a class="ancla" href="#{sid}" aria-label="Enlace a este apartado">#</a></h3>',
                    texto,
                )
            )
            i += 1
            continue

        # --- Tabla ---------------------------------------------------------
        if pelada.startswith("|") and i + 1 < len(lineas) and re.match(
            r"^\|[\s:|-]+\|$", lineas[i + 1].strip()
        ):
            cerrar_parrafo()

            def celdas(fila):
                return [c.strip() for c in fila.strip().strip("|").split("|")]

            cabeceras = celdas(pelada)
            i += 2
            filas = []
            while i < len(lineas) and lineas[i].strip().startswith("|"):
                filas.append(celdas(lineas[i]))
                i += 1
            destino = actual["bloques"] if actual else entradilla
            texto = " ".join(" ".join(f) for f in filas)
            destino.append(Bloque("tabla", tabla_html(cabeceras, filas), texto))
            continue

        # --- Listas --------------------------------------------------------
        m_ol = re.match(r"^(\d+)\.\s+(.*)$", pelada)
        m_ul = re.match(r"^[-*]\s+(.*)$", pelada)
        if m_ol or m_ul:
            cerrar_parrafo()
            ordenada = bool(m_ol)
            items = []
            while i < len(lineas):
                p = lineas[i].strip()
                mo = re.match(r"^(\d+)\.\s+(.*)$", p)
                mu = re.match(r"^[-*]\s+(.*)$", p)
                if ordenada and mo:
                    items.append(mo.group(2))
                elif not ordenada and mu:
                    items.append(mu.group(1))
                elif p and items and not p.startswith(("|", "#", "-", "*")):
                    items[-1] += " " + p  # continuación de la línea anterior
                else:
                    break
                i += 1

            destino = actual["bloques"] if actual else entradilla
            # El rótulo justo anterior tiñe la lista de verde o de rojo.
            clase = ""
            if destino and destino[-1].tipo == "rotulo":
                if "rotulo--si" in destino[-1].html:
                    clase = ' class="lista--si"'
                elif "rotulo--no" in destino[-1].html:
                    clase = ' class="lista--no"'
            etiqueta = "ol" if ordenada else "ul"
            cuerpo = "".join(f"<li>{inline(x)}</li>" for x in items)
            destino.append(
                Bloque("lista", f"<{etiqueta}{clase}>{cuerpo}</{etiqueta}>", " ".join(items))
            )
            continue

        # --- Línea en blanco o texto normal ---------------------------------
        if not pelada:
            cerrar_parrafo()
        else:
            buffer_p.append(pelada)
        i += 1

    cerrar_parrafo()
    return titulo, entradilla, secciones


# ==========================================================================
#  Retoques por sección: la FAQ en acordeón, las fuentes en tarjetas
# ==========================================================================

# Una pregunta es un párrafo que abre en negrita y esa negrita acaba en '?'.
# No se exige que empiece por '¿': una de las preguntas del documento arranca
# con texto llano ("Se le cayeron todas las hojas, ¿está muerto?") y se
# quedaba fuera del acordeón.
RE_PREGUNTA = re.compile(r"^<p><strong>([^<]*\?)</strong>\s*(.+)</p>$", re.S)


def faq_en_acordeon(bloques):
    """Convierte cada '**¿pregunta?** respuesta' en un <details> plegable.

    Dieciocho preguntas seguidas son un muro de texto; plegadas caben en una
    pantalla y el cliente encuentra la suya de un vistazo.
    """
    salida = []
    for b in bloques:
        m = RE_PREGUNTA.match(b.html) if b.tipo == "p" else None
        if m:
            pregunta, respuesta = m.group(1), m.group(2).strip()
            salida.append(
                Bloque(
                    "faq",
                    "<details class='faq-item'>"
                    f"<summary>{pregunta}</summary>"
                    f"<div class='faq-cuerpo'><p>{respuesta}</p></div>"
                    "</details>",
                    b.texto,
                )
            )
        else:
            salida.append(b)
    return salida


def cuenta_palabras(texto):
    return len(re.findall(r"\w+", texto, flags=re.UNICODE))


def render_secciones(secciones):
    partes = []
    for s in secciones:
        bloques = s["bloques"]
        if s["variante"] == "faq":
            bloques = faq_en_acordeon(bloques)

        palabras = sum(cuenta_palabras(b.texto) for b in bloques)
        minutos = max(1, round(palabras / 200))
        variante = f' data-variante="{s["variante"]}"' if s["variante"] else ""
        numero = (
            f'<span class="sec-num" aria-hidden="true">{esc(s["numero"])}</span>'
            if s["numero"]
            else ""
        )
        partes.append(
            f'<section class="seccion" id="{s["id"]}"{variante} data-minutos="{minutos}">'
            f'<header class="sec-cabecera">{numero}'
            f'<h2>{inline(s["titulo"])}</h2>'
            f'<span class="sec-tiempo">{minutos} min de lectura</span>'
            f'<a class="ancla" href="#{s["id"]}" aria-label="Enlace a esta sección">#</a>'
            "</header>"
            f'<div class="sec-cuerpo">{"".join(b.html for b in bloques)}</div>'
            "</section>"
        )
    return "\n".join(partes)


def buscar_seccion(secciones, *claves):
    """La primera sección cuyo id contenga alguna de las claves."""
    for clave in claves:
        for s in secciones:
            if clave in s["id"]:
                return s
    return None


# Las tres puertas de entrada de la portada. Cada una responde a una de las
# tres situaciones reales en las que alguien abre esto: acaba de llegar a
# casa con el árbol, ve algo raro, o quiere saber qué le toca hacer ahora.
RUTAS = (
    ("Empieza por aquí", "Acabo de recibir mi árbol",
     "Las reglas que salvan el 90% de los bonsáis y qué hacer las tres primeras semanas.",
     ("primeras-tres-semanas", "reglas-que-salvan")),
    ("Urgencias", "Algo le está pasando",
     "Busca el síntoma que estás viendo y ve directo a la causa probable.",
     ("tabla-de-diagnostico", "diagnostico", "plagas")),
    ("Según dónde vives", "¿Qué le toca ahora?",
     "El calendario real de Sierra, Costa y Amazonía, que no es el de las guías de afuera.",
     ("calendario", "riego")),
)


def render_portada(titulo, entradilla, secciones, minutos):
    tarjetas = []
    for eyebrow, nombre, detalle, claves in RUTAS:
        destino = buscar_seccion(secciones, *claves)
        if not destino:
            continue
        tarjetas.append(
            f'<a class="ruta" href="#{destino["id"]}">'
            f'<span class="ruta-ojo">{esc(eyebrow)}</span>'
            f'<strong class="ruta-nombre">{esc(nombre)}</strong>'
            f'<span class="ruta-detalle">{esc(detalle)}</span>'
            '<span class="ruta-flecha" aria-hidden="true">&rarr;</span></a>'
        )

    lead = "".join(b.html for b in entradilla)
    return (
        '<header class="portada">'
        '<p class="portada-ojo">DecoGarden · Guía del propietario</p>'
        f'<h1 class="portada-titulo">{inline(titulo)}</h1>'
        f'<div class="portada-lead">{lead}</div>'
        '<ul class="portada-meta">'
        f'<li>{len(secciones)} secciones</li>'
        f'<li>{minutos} min de lectura</li>'
        f'<li>Actualizada en {date.today().strftime("%m/%Y")}</li>'
        "</ul>"
        f'<nav class="rutas" aria-label="Accesos rápidos">{"".join(tarjetas)}</nav>'
        "</header>"
    )


def render_indice(secciones):
    """El índice lateral. Se genera aquí, no en el navegador, para que el
    orden y los números salgan exactamente del documento fuente."""
    filas = []
    for s in secciones:
        subs = "".join(
            f'<li><a href="#{sub["id"]}">{inline(sub["titulo"])}</a></li>'
            for sub in s["sub"]
        )
        bloque_subs = f'<ul class="idx-sub">{subs}</ul>' if subs else ""
        num = f'<span class="idx-num">{esc(s["numero"])}</span>' if s["numero"] else ""
        filas.append(
            f'<li class="idx-item" data-para="{s["id"]}">'
            f'<a class="idx-enlace" href="#{s["id"]}">{num}<span>{inline(s["titulo"])}</span></a>'
            f"{bloque_subs}</li>"
        )
    return f'<ul class="idx-lista">{"".join(filas)}</ul>'


# ==========================================================================
#  Cifrado
# ==========================================================================


def cifrar(texto, codigo, sal_b64):
    """Comprime y cifra con AES-256-GCM.

    Se comprime ANTES de cifrar porque el cifrado produce bytes indistinguibles
    del ruido, que ya no comprimen ni en el disco ni en el transporte: si lo
    hiciéramos al revés, el cliente se bajaría cuatro veces más datos. GCM
    además autentica, así que un código equivocado falla al descifrar en vez
    de devolver basura, y el navegador puede decir 'código incorrecto'.
    """
    sal = base64.b64decode(sal_b64)
    clave = hashlib.pbkdf2_hmac("sha256", codigo.encode("utf-8"), sal, ITERACIONES, 32)
    iv = secrets.token_bytes(12)
    # mtime=0: si no, el gzip mete la fecha y el archivo cambiaría en cada
    # ejecución aunque el texto fuera idéntico, ensuciando el diff de git.
    comprimido = gzip.compress(texto.encode("utf-8"), compresslevel=9, mtime=0)
    cifrado = AESGCM(clave).encrypt(iv, comprimido, None)
    return {
        "v": 1,
        "kdf": "PBKDF2-SHA256",
        "it": ITERACIONES,
        "sal": sal_b64,
        "iv": base64.b64encode(iv).decode(),
        "ct": base64.b64encode(cifrado).decode(),
    }, len(comprimido), len(cifrado)


def sellar_assets(texto):
    """Le pega a cada .css y .js su huella de contenido, como generar-productos.py."""

    def reemplazo(m):
        atributo, archivo = m.group(1), m.group(2)
        ruta = BASE / archivo
        if not ruta.is_file():
            return m.group(0)
        contenido = ruta.read_bytes().replace(b"\r\n", b"\n")
        return f'{atributo}="{archivo}?v={hashlib.sha1(contenido).hexdigest()[:8]}"'

    return re.sub(
        r'(href|src)="([^"?:]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', reemplazo, texto
    )


# ==========================================================================


def main():
    ap = argparse.ArgumentParser(description="Genera la guía de cuidado cifrada.")
    ap.add_argument("--fuente", default=str(FUENTE), help="el .md de origen")
    ap.add_argument(
        "--nuevo-codigo",
        action="store_true",
        help="rota el código de acceso (invalida todos los QR ya repartidos)",
    )
    args = ap.parse_args()

    origen = Path(args.fuente)
    for ruta in (origen, PLANTILLA):
        if not ruta.exists():
            sys.exit(f"Falta el archivo {ruta.name}")

    secreto = cargar_secreto(rotar=args.nuevo_codigo)
    md = origen.read_text(encoding="utf-8")
    titulo, entradilla, secciones = analizar(md)

    print(f"Leyendo {origen.name}: {len(secciones)} secciones\n")

    palabras = sum(
        cuenta_palabras(b.texto) for s in secciones for b in s["bloques"]
    )
    minutos = max(1, round(palabras / 200))

    contenido = (
        render_portada(titulo, entradilla, secciones, minutos)
        + f'<div class="indice-fuente" hidden>{render_indice(secciones)}</div>'
        + render_secciones(secciones)
    )

    payload, n_comp, n_cif = cifrar(contenido, secreto["codigo"], secreto["sal"])

    # En castellano y con el mes escrito: '2026-08-25' en el pie de una guía
    # para clientes se lee como un número de serie, no como una fecha.
    # No usamos strftime con locale porque depende de la configuración de la
    # máquina y en Windows suele no estar el locale español instalado.
    MESES = (
        "enero febrero marzo abril mayo junio julio agosto "
        "septiembre octubre noviembre diciembre"
    ).split()
    hoy = date.today()
    largo = f"{hoy.day} de {MESES[hoy.month - 1]} de {hoy.year}"

    plantilla = PLANTILLA.read_text(encoding="utf-8")
    salida = (
        plantilla.replace("{{PAYLOAD}}", json.dumps(payload, separators=(",", ":")))
        .replace("{{ACTUALIZADO_LARGO}}", largo)
        .replace("{{ACTUALIZADO}}", hoy.isoformat())
        .replace("{{SECCIONES}}", str(len(secciones)))
    )
    salida = sellar_assets(salida)

    archivo = BASE / f"guia-{secreto['slug']}.html"
    anterior = archivo.read_text(encoding="utf-8") if archivo.exists() else None
    # El bloque cifrado cambia siempre (el IV es nuevo cada vez), así que
    # comparamos el resto: si solo cambió el IV, no reescribimos el archivo.
    def sin_payload(t):
        return re.sub(r'id="carga"[^>]*>.*?</script>', "", t or "", flags=re.S)

    cambio = anterior is None or sin_payload(anterior) != sin_payload(salida)
    if cambio:
        archivo.write_text(salida, encoding="utf-8")

    url = f"{secreto['sitio']}/{archivo.stem}#k={secreto['codigo']}"
    print(f"  {'ACT' if cambio else ' = '} {archivo.name}")
    print(f"      contenido {len(contenido) // 1024} KB -> cifrado {n_cif // 1024} KB")
    print(f"\n  Código de acceso : {secreto['codigo']}")
    print(f"  URL del QR       : {url}")
    print("\n  Siguiente paso: python generar-qr.py")
    print("  Guarda guia-secreto.json: sin él no puedes regenerar la guía.")


if __name__ == "__main__":
    main()
