"""La huella de contenido de los .css y .js: style.css?v=a1b2c3d4.

Sin esto, el navegador se queda con la copia vieja: cambias el CSS, recargas y
no ves nada. Pasa en local y también tras un despliegue, con quien ya había
visitado la página. Como la huella sale del contenido, la URL solo cambia
cuando el archivo cambia de verdad, así que la caché sigue sirviendo de algo.

Vive en un módulo propio porque la usan los tres generadores: si cada uno
tuviera su copia, a la primera que se desincronizaran las páginas empezarían a
pedir un CSS con la versión equivocada.
"""

import hashlib
import re

from rutas import PUBLICO

_ENLACE = re.compile(r'(href|src)="([^"?:]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"')


def sellar_assets(html):
    """Pega la huella a cada href/src local que apunte a un .css o un .js."""

    def reemplazo(m):
        atributo, archivo = m.group(1), m.group(2)
        ruta = PUBLICO / archivo.lstrip("/")
        if not ruta.is_file():
            return m.group(0)
        # Normalizamos los saltos de línea antes de la huella. Con
        # core.autocrlf git escribe CRLF en Windows y LF en el clon que
        # compila Cloudflare: sin esto el mismo archivo daría dos sellos
        # distintos y cada checkout ensuciaría el diff de todas las páginas.
        contenido = ruta.read_bytes().replace(b"\r\n", b"\n")
        huella = hashlib.sha1(contenido).hexdigest()[:8]
        return f'{atributo}="{archivo}?v={huella}"'

    return _ENLACE.sub(reemplazo, html)
