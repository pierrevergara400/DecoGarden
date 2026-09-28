# DecoGarden

Sitio estático publicado en Cloudflare Pages desde la rama `main` de este
repositorio. No hay base de datos ni servidor en producción: todo el HTML se
genera aquí, en tu máquina, a partir de unos pocos archivos de datos.

## Cómo está organizado

```
public/        Lo que se publica. Cloudflare sirve esta carpeta tal cual
               (Build output directory = public, sin comando de build).
  *.html         las páginas: a mano (index, legales, 404) o generadas
  assets/css/    estilos
  assets/js/     scripts del navegador
  data/          catalog.json y paginas.json, que lee app.js en el navegador
  Images/ Icons/ Media/   fotos, iconos y logos (sus URLs no cambian)
  _headers _redirects robots.txt sitemap.xml manifest.json

datos/         Fuentes que no se publican: productos.json, blog.json, envios.json
plantillas/    El diseño de las páginas generadas (producto, post, blog, guia)
panel/         El panel de /admin. Solo existe en local, nunca se publica
scripts/       Generadores, servidor local y mantenimiento
  rutas.py       el único sitio que sabe dónde está cada carpeta
  sellado.py     la huella ?v= de los .css y .js, compartida por los generadores
docs/          Roadmap y notas
privado/       La guía en claro, su secreto y los QR. Fuera de git (ver .gitignore)
```

La regla es simple: **si no está en `public/`, no sale a internet.** Los scripts,
las plantillas, los datos de trabajo y el panel ya no se publican.

## El día a día

```bash
python scripts/servidor.py
```

Levanta el sitio en <http://localhost:8435> y el panel en
<http://localhost:8435/admin>. El servidor imita las reglas de Cloudflare
(`/privacidad` en vez de `/privacidad.html`, el 404 propio, etc.), así que lo
que ves ahí es lo que se publica.

Desde el panel puedes:

- **Apagar y encender productos.** Un producto apagado desaparece de la home,
  del sitemap, de los datos estructurados y de los "relacionados" de las otras
  fichas. Si tenía página propia, esa página se retira del disco. Nada se borra
  de `public/data/catalog.json`: lo enciendes y vuelve igual.
- **Editar productos.** Precio, etiqueta, descripción, altura, edad, categoría.
- **Ver qué fotos faltan.** Lee `public/Images/productos/<id>/` y te dice, producto por
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
| `public/data/catalog.json` | Los bonsáis: nombre, precio, foto, categoría, si está publicado |
| `datos/productos.json` | El texto largo de las fichas que tienen página propia |
| `datos/blog.json` | Los artículos, con el cuerpo en Markdown |
| `datos/envios.json` | Transportista, ciudades y oficinas |
| `public/data/paginas.json` | Generado. Mapa id → URL que usa la home para enlazar las tarjetas |

Y los tres generadores:

| Script | Qué hace |
| --- | --- |
| `scripts/generar_blog.py` | `blog.json` → `blog.html` y un `blog-<slug>.html` por artículo |
| `scripts/generar_productos.py` | `productos.json` + `catalog.json` → las fichas, el sitemap y el sellado de assets |
| `scripts/generar_guia.py` | La guía de cuidado cifrada |
| `scripts/generar_qr.py` | Los QR de la guía de cuidado |

El orden importa: **primero el blog, después los productos**. El segundo es el
que sella los assets de todas las páginas y rehace el sitemap contando ya lo que
escribió el primero. El botón "Publicar" del panel los corre en ese orden.

```bash
python scripts/generar_blog.py && python scripts/generar_productos.py
```

Los `producto-*.html`, `blog*.html`, `sitemap.xml` y `paginas.json` se
sobrescriben enteros en cada ejecución: no los edites a mano, edita la plantilla
(`plantillas/`) o el JSON.

## Envíos

Quién transporta, a dónde y qué promete la web vive en `datos/envios.json`. La web no
tiene ningún dato de envío escrito a mano: todo sale de ahí.

```
entrega    a domicilio en Quito; al resto, retiro en oficina de Urbano Express
ciudades   las 28 en las que Urbano tiene oficina
oficinas   74 mostradores con dirección, horario y coordenadas
```

**Quito es el único sitio con entrega a domicilio.** Desde Ibarra el paquete
llega al día siguiente y sale a reparto esa misma tarde. En el resto del país el
reparto a domicilio añade varios días, y un bonsái encajonado no aguanta esa
espera: por eso va a oficina, donde el cliente elige el punto que le queda cerca
y lo recoge cuando quiere. En Quito caben las dos cosas.

La pasarela **pregunta primero la ciudad**. Quien compra sabe dónde vive; lo que
no tiene por qué saber es si en su ciudad hay entrega a domicilio. Con la ciudad
puesta, cada quien ve solo lo que existe para él: en Quito, las dos opciones; en
el resto, el retiro directamente, sin presentarlo como una elección que no es
tal. La dirección y el horario del punto elegido salen en pantalla, y viajan
también en el mensaje de WhatsApp del pedido.

Para añadir una ciudad con entrega a domicilio, métela en `entrega.domicilio`
dentro de `datos/envios.json`: la pasarela, la home, las fichas y los términos se
adaptan solos.

### Cuando Urbano abre o cierra una oficina

```bash
python scripts/actualizar_oficinas.py
```

Baja el listado de la web de Urbano y reescribe la parte `oficinas` de
`datos/envios.json`. Avisa de las ciudades nuevas y de las que desaparecieron. Lo que
NO toca es `entrega` ni `ciudades`: esos son tuyos y se conservan.

Revisa siempre lo que sale antes de publicar. Es la dirección a la que va a ir
un cliente a recoger un árbol, y si Urbano la tiene mal en su web, la tendrás
mal tú también.

**`tipo` es una deducción, no un dato oficial.** Urbano mezcla en el mismo mapa
sus oficinas y los negocios que operan como punto autorizado —una papelería, una
heladería, un local de informática— sin marcar cuál es cuál. El script lo deduce
de cómo está escrita la dirección: acierta en la mayoría y falla en los
ambiguos, como una oficina dentro de un centro comercial. Solo se usa para
ordenar la lista (las propias y la matriz arriba) y **no se le enseña al
cliente**, porque una etiqueta equivocada es peor que ninguna. Lo que sí se le
enseña es el horario, que es la diferencia que de verdad le afecta. Confírmalo
con tu contacto de Urbano cuando puedas.

Hay dos entradas en Quito cuya "dirección" es solo `AGENTE AUTORIZADO ...`. Si
alguien las elige para retirar, no sabrá a dónde ir: pídele a Urbano la
dirección real o quítalas.

### Cambiar a dónde envías

Quita o añade ciudades en `ciudades` dentro de `datos/envios.json`. Están las 28 con
oficina, no solo aquellas donde corres anuncios: quien te encuentre por el blog
o por Instagram desde otra ciudad también puede comprar. Después:

```bash
python scripts/generar_productos.py
```

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

## Reseñas de la home

Están escritas a mano en `public/index.html`, en la sección "Quienes ya lo
tienen". Cada reseña es un `<article class="card resena">` con sus fotos arriba
y el texto debajo. Para sumar una, copia uno de esos bloques:

- Sin fotos: quita el `<div class="resena-fotos">`.
- Con varias fotos: mételas todas en el mismo `<div class="resena-fotos">` y se
  convierten solas en un carrusel.

Van en columnas, así que pueden ser tantas como quieras sin que se descuadre.
Si quieres que Google las vea como reseñas, añádelas también al bloque
`"review"` de los datos estructurados, arriba en el mismo archivo.

## Fotos de producto

Van en `public/Images/productos/<id>/`, y el nombre del archivo define de qué es la
foto. El número solo ordena la galería:

```
public/Images/productos/guayacan/
  1-principal.webp
  2-tronco.webp
  3-follaje.webp
  4-escala.webp
  5-maceta.webp
  6-giro.mp4
  6-giro-poster.webp
```

No hay que declararlas en ningún sitio: el generador lee la carpeta. La pestaña
"Fotos pendientes" del panel te dice cuáles faltan. Los nombres que entiende
están en [docs/fotos-productos.md](docs/fotos-productos.md).

## Sobre el panel

Solo funciona con `scripts/servidor.py` corriendo, y la API únicamente atiende
peticiones que vienen de tu propia máquina: escribe archivos y ejecuta guiones,
así que no tiene por qué estar disponible para el resto de la red. Vive en
`panel/`, fuera de `public/`, así que en `decogarden.pages.dev` ni siquiera
existe: `/admin` rebota a la home. No guarda contraseñas ni claves: estar en el
repositorio no significa nada.

Al guardar deja una copia `.bak` del archivo anterior (ignorada por git), por si
te arrepientes antes de hacer commit.
