# DecoGarden

Sitio estático publicado en Cloudflare Pages desde la rama `main` de este
repositorio. No hay base de datos ni servidor en producción: todo el HTML se
genera aquí, en tu máquina, a partir de unos pocos archivos de datos.

## El día a día

```bash
python servidor.py
```

Levanta el sitio en <http://localhost:8435> y el panel en
<http://localhost:8435/admin>. El servidor imita las reglas de Cloudflare
(`/privacidad` en vez de `/privacidad.html`, el 404 propio, etc.), así que lo
que ves ahí es lo que se publica.

Desde el panel puedes:

- **Apagar y encender productos.** Un producto apagado desaparece de la home,
  del sitemap, de los datos estructurados y de los "relacionados" de las otras
  fichas. Si tenía página propia, esa página se retira del disco. Nada se borra
  de `catalog.json`: lo enciendes y vuelve igual.
- **Editar productos.** Precio, etiqueta, descripción, altura, edad, categoría.
- **Ver qué fotos faltan.** Lee `Images/productos/<id>/` y te dice, producto por
  producto, qué tomas tienes y cuáles no.
- **Escribir el blog.** Cada artículo se convierte en una página HTML real, con
  su fecha, su resumen y sus datos estructurados.

"Guardar cambios" escribe los JSON. "Publicar al sitio" corre los generadores.
Son dos botones distintos a propósito: editar y publicar son dos decisiones.

Después de publicar, los cambios están en tu disco pero todavía no en línea.
Para eso:

```bash
git add -A && git commit -m "..." && git push
```

Cloudflare reconstruye solo en cuanto llega el push.

## Los archivos que importan

| Archivo | Qué guarda |
| --- | --- |
| `catalog.json` | Los bonsáis: nombre, precio, foto, categoría, si está publicado |
| `productos.json` | El texto largo de las fichas que tienen página propia |
| `blog.json` | Los artículos, con el cuerpo en Markdown |
| `paginas.json` | Generado. Mapa id → URL que usa la home para enlazar las tarjetas |

Y los tres generadores:

| Script | Qué hace |
| --- | --- |
| `generar-blog.py` | `blog.json` → `blog.html` y un `blog-<slug>.html` por artículo |
| `generar-productos.py` | `productos.json` + `catalog.json` → las fichas, el sitemap y el sellado de assets |
| `generar-qr.py` | Los QR de la guía de cuidado |

El orden importa: **primero el blog, después los productos**. El segundo es el
que sella los assets de todas las páginas y rehace el sitemap contando ya lo que
escribió el primero. El botón "Publicar" del panel los corre en ese orden.

```bash
python generar-blog.py && python generar-productos.py
```

Los `producto-*.html`, `blog*.html`, `sitemap.xml` y `paginas.json` se
sobrescriben enteros en cada ejecución: no los edites a mano, edita la plantilla
(`_plantilla-*.html`) o el JSON.

## Escribir un artículo

En la pestaña Blog del panel, "+ Artículo nuevo". Nace como borrador, así que
puedes dejarlo a medias sin que se publique.

El cuerpo es Markdown, con lo justo:

```
## Un subtítulo
### Uno más pequeño

Un párrafo con **negrita**, *cursiva* y [un enlace](/blog).

- una lista
- otra línea

1. una lista numerada
2. otra

> una cita

![texto alternativo](Images/foto.webp)

---
```

El titular de la página se parte en dos: la segunda mitad sale en cursiva, igual
que en las fichas de producto. Si lo dejas vacío se usa el título.

## Fotos de producto

Van en `Images/productos/<id>/`, y el nombre del archivo define de qué es la
foto. El número solo ordena la galería:

```
Images/productos/guayacan/
  1-principal.webp
  2-tronco.webp
  3-follaje.webp
  4-escala.webp
  5-maceta.webp
  6-giro.mp4
  6-giro-poster.webp
```

No hay que declararlas en ningún sitio: el generador lee la carpeta. La pestaña
"Fotos pendientes" del panel te dice cuáles faltan.

## Sobre el panel

Solo funciona con `servidor.py` corriendo, y la API únicamente atiende
peticiones que vienen de tu propia máquina: escribe archivos y ejecuta guiones,
así que no tiene por qué estar disponible para el resto de la red. En
`decogarden.pages.dev` la página existe pero no puede hacer nada, y te lo dice
al entrar. Por eso no guarda contraseñas ni claves: subirla al repositorio no
significa nada.

Al guardar deja una copia `.bak` del archivo anterior (ignorada por git), por si
te arrepientes antes de hacer commit.
