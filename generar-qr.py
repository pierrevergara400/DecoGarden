#!/usr/bin/env python3
"""
Genera los QR imprimibles que dan acceso a la guía de cuidado.

Lee el código y el slug de guia-secreto.json y produce, dentro de qr/:

    qr-guia.png       el QR solo, en alta resolución, para pegar donde sea
    qr-etiqueta.png   el QR con su texto, listo para la etiqueta de la maceta
    qr-hoja.png       una hoja A4 con 12 etiquetas para imprimir y recortar

OJO: estas imágenes CONTIENEN el código de acceso. La carpeta qr/ está en
.gitignore por ese motivo — si subes un QR al repositorio público, regalas
la guía. Imprímelos y guárdalos, pero no los subas a ningún sitio.

Uso:
    python generar-qr.py
"""

import json
import sys
from pathlib import Path

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_H
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit(
        "Faltan librerías. Instálalas con:\n\n"
        "    python -m pip install qrcode pillow\n"
    )

BASE = Path(__file__).resolve().parent
SECRETO = BASE / "guia-secreto.json"
SALIDA = BASE / "qr"

# Tinta y papel de la etiqueta, en la paleta de la marca.
VERDE = (25, 83, 43)
PAPEL = (248, 244, 231)
GRIS = (107, 106, 92)


def fuente(tamano, negrita=False):
    """La primera tipografía del sistema que exista, en el tamaño pedido."""
    candidatas = (
        ["georgiab.ttf", "arialbd.ttf", "seguisb.ttf", "DejaVuSans-Bold.ttf"]
        if negrita
        else ["georgia.ttf", "arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"]
    )
    for nombre in candidatas:
        try:
            return ImageFont.truetype(nombre, tamano)
        except OSError:
            continue
    return ImageFont.load_default()


def centrar(dibujo, y, texto, fnt, color, ancho):
    caja = dibujo.textbbox((0, 0), texto, font=fnt)
    dibujo.text(((ancho - (caja[2] - caja[0])) / 2, y), texto, font=fnt, fill=color)
    return y + (caja[3] - caja[1])


def hacer_qr(url, lado):
    """El QR en sí.

    Corrección de errores alta (H, ~30%): esta etiqueta va pegada a una
    maceta, expuesta a agua de riego, tierra y roce. Con corrección baja,
    un arañazo la inutiliza; con H sigue leyéndose bastante estropeada.
    """
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=VERDE, back_color=PAPEL).convert("RGB")
    return img.resize((lado, lado), Image.NEAREST)


def hacer_etiqueta(url, codigo, ancho=760):
    """El QR con su texto: lo que se pega en la maceta."""
    margen = 40
    lado_qr = ancho - margen * 2
    qr = hacer_qr(url, lado_qr)

    f_titulo = fuente(46, negrita=True)
    f_texto = fuente(27)
    f_codigo = fuente(25, negrita=True)

    alto = margen + 56 + lado_qr + 150
    lienzo = Image.new("RGB", (ancho, alto), PAPEL)
    d = ImageDraw.Draw(lienzo)

    y = centrar(d, margen, "Guía de cuidado", f_titulo, VERDE, ancho) + 26
    lienzo.paste(qr, (margen, y))
    y += lado_qr + 22

    y = centrar(d, y, "Escanea con la cámara de tu teléfono", f_texto, GRIS, ancho) + 22
    y = centrar(d, y, codigo, f_codigo, VERDE, ancho) + 18
    centrar(d, y, "DecoGarden · San Antonio de Ibarra", f_texto, GRIS, ancho)

    d.rectangle([(0, 0), (ancho - 1, alto - 1)], outline=VERDE, width=3)
    return lienzo


def hacer_hoja(etiqueta, columnas=3, filas=4, margen=90, hueco=40):
    """Una hoja A4 a 300 ppp con la etiqueta repetida, para imprimir y cortar."""
    A4 = (2480, 3508)
    ancho_celda = (A4[0] - margen * 2 - hueco * (columnas - 1)) // columnas
    escala = ancho_celda / etiqueta.width
    celda = etiqueta.resize(
        (ancho_celda, int(etiqueta.height * escala)), Image.LANCZOS
    )

    hoja = Image.new("RGB", A4, (255, 255, 255))
    for fila in range(filas):
        y = margen + fila * (celda.height + hueco)
        if y + celda.height > A4[1] - margen:
            break
        for col in range(columnas):
            hoja.paste(celda, (margen + col * (ancho_celda + hueco), y))
    return hoja


def main():
    if not SECRETO.exists():
        sys.exit("Falta guia-secreto.json. Corre antes: python generar-guia.py")

    secreto = json.loads(SECRETO.read_text(encoding="utf-8"))
    codigo = secreto["codigo"]
    url = f"{secreto['sitio']}/guia-{secreto['slug']}#k={codigo}"

    SALIDA.mkdir(exist_ok=True)
    hacer_qr(url, 1400).save(SALIDA / "qr-guia.png")
    etiqueta = hacer_etiqueta(url, codigo)
    etiqueta.save(SALIDA / "qr-etiqueta.png")
    hacer_hoja(etiqueta).save(SALIDA / "qr-hoja.png", dpi=(300, 300))

    print(f"URL codificada: {url}\n")
    for nombre, que in (
        ("qr-guia.png", "el QR solo, en alta resolución"),
        ("qr-etiqueta.png", "la etiqueta con texto"),
        ("qr-hoja.png", "hoja A4 con 12 etiquetas, a 300 ppp"),
    ):
        print(f"  OK  qr/{nombre}  — {que}")

    print("\n  No subas la carpeta qr/ a ningún sitio: el QR lleva el código dentro.")


if __name__ == "__main__":
    main()
