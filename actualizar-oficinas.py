#!/usr/bin/env python3
"""
Baja el listado de oficinas de Urbano Express y lo deja en envios.json.

Uso:
    python actualizar-oficinas.py

Urbano publica sus agencias en un mapa de su web, y ese mapa se alimenta de un
endpoint público con la dirección, el horario y las coordenadas de cada una.
Leerlo de ahí en vez de copiar las direcciones a mano significa que, cuando
abran o cierren una oficina, actualizar el sitio es volver a ejecutar esto.

Lo que este script NO hace es decidir a qué ciudades envías tú: eso lo manda
`ciudades` en envios.json, que se conserva entre ejecuciones. Aquí solo se
refresca el listado de oficinas y se avisa de lo que cambió.

Revisa siempre lo que sale antes de publicarlo. Es la dirección a la que va a
ir un cliente a recoger un árbol: si Urbano la tiene desactualizada en su web,
la tendrás tú también.
"""

import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from html import unescape
from pathlib import Path

BASE = Path(__file__).resolve().parent
DESTINO = BASE / "envios.json"

FUENTE = "https://www.urbano.com.ec/wp-json/wpgmza/v1/markers"
AGENCIAS = "https://www.urbano.com.ec/agencias-2/"

# Sin cabecera de navegador el servidor responde con un 403.
CABECERAS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json",
}

# Puntos que no son mostrador de atención al público: bodegas y centros de
# clasificación. Un cliente que vaya ahí a recoger su bonsái se encuentra una
# nave industrial, así que no entran en el listado.
NO_PUBLICAS = re.compile(r"log[ií]stica|bodega|postal|matriz|stodom", re.I)


def sin_tildes(texto):
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if not unicodedata.combining(c)
    )


def limpiar(texto):
    """Quita etiquetas y deja el texto en una sola línea."""
    texto = re.sub(r"<[^>]+>", " ", texto or "")
    return re.sub(r"\s+", " ", unescape(texto).replace("\xa0", " ")).strip()


def bajar(url, cabeceras=None):
    peticion = urllib.request.Request(url, headers=cabeceras or CABECERAS)
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return respuesta.read().decode("utf-8", errors="replace")


def ciudades_oficiales():
    """Las ciudades del desplegable de la página de agencias.

    Es la lista que Urbano considera que tiene oficina, y sirve para agrupar:
    el título de cada marcador empieza por el nombre de su ciudad.
    """
    html = bajar(AGENCIAS, {**CABECERAS, "Accept": "text/html"})
    bloque = re.search(r"<select[^>]*>(.*?)</select>", html, re.S)
    if not bloque:
        sys.exit("No encontré el desplegable de ciudades: la página cambió.")
    valores = re.findall(r"<option[^>]*>(.*?)</option>", bloque.group(1), re.S)
    return [v for v in (limpiar(x) for x in valores) if v and "elige" not in v.lower()]


def trocear(descripcion):
    """De la ficha HTML de un marcador saca dirección y horario."""
    partes = [limpiar(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", descripcion, re.S)]
    partes = [p for p in partes if p]
    horario = next((p for p in partes if re.search(r"horario", p, re.I)), "")
    direccion = next((p for p in partes if not re.search(r"horario", p, re.I)), "")
    horario = re.sub(r"^.*?horario de atenci[oó]n:?\s*", "", horario, flags=re.I)
    return direccion, horario.strip()


def ciudad_de(titulo, ciudades):
    """A qué ciudad pertenece un marcador, por el principio de su título."""
    t = sin_tildes(titulo).lower()
    coincidencias = [c for c in ciudades if t.startswith(sin_tildes(c).lower())]
    # La más larga gana: "La Libertad" antes que "Libertad".
    return max(coincidencias, key=len) if coincidencias else None


def recoger():
    ciudades = ciudades_oficiales()
    marcadores = json.loads(bajar(FUENTE))

    por_ciudad = {}
    descartadas = 0
    for m in marcadores:
        titulo = limpiar(m.get("title"))
        ciudad = ciudad_de(titulo, ciudades)
        if not ciudad:
            continue
        if NO_PUBLICAS.search(titulo):
            descartadas += 1
            continue
        direccion, horario = trocear(m.get("description") or "")
        if not direccion:
            descartadas += 1
            continue
        por_ciudad.setdefault(ciudad, {})
        # El mismo mostrador aparece repetido con el nombre en mayúsculas y en
        # minúsculas. La dirección es lo que de verdad lo identifica.
        clave = sin_tildes(direccion).lower()
        if clave not in por_ciudad[ciudad]:
            por_ciudad[ciudad][clave] = {
                "nombre": titulo,
                "direccion": direccion,
                "horario": horario,
                "lat": round(float(m["lat"]), 6),
                "lng": round(float(m["lng"]), 6),
            }

    limpio = {
        ciudad: sorted(oficinas.values(), key=lambda o: o["nombre"])
        for ciudad, oficinas in sorted(por_ciudad.items())
    }
    return limpio, descartadas


def main():
    try:
        oficinas, descartadas = recoger()
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        sys.exit(f"No pude leer las agencias de Urbano: {e}")

    previo = {}
    if DESTINO.exists():
        previo = json.loads(DESTINO.read_text(encoding="utf-8"))

    antes = previo.get("oficinas", {})
    nuevas = [c for c in oficinas if c not in antes]
    idas = [c for c in antes if c not in oficinas]

    datos = dict(previo)
    datos["_comentario"] = (
        "Oficinas de Urbano Express, bajadas de su web con actualizar-oficinas.py. "
        "No las edites a mano: se sobrescriben. Lo que sí es tuyo es 'ciudades', "
        "que decide a dónde envías, y 'entrega', que es lo que promete el sitio."
    )
    datos["fuente"] = AGENCIAS
    datos["oficinas"] = oficinas
    datos.setdefault("ciudades", sorted(oficinas))

    DESTINO.write_text(
        json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    total = sum(len(v) for v in oficinas.values())
    print(f"{len(oficinas)} ciudades, {total} oficinas de atención al público.")
    if descartadas:
        print(f"  ({descartadas} puntos descartados: bodegas y centros logísticos)")
    for ciudad in nuevas:
        print(f"  NUEVA   {ciudad}")
    for ciudad in idas:
        print(f"  YA NO   {ciudad} — revisa si sigues enviando ahí")
    print(f"\nEscrito en {DESTINO.name}. Revísalo antes de publicar.")


if __name__ == "__main__":
    main()
