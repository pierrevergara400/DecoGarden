# Qué le falta a DecoGarden

Estado a 28 de septiembre de 2026. Ordenado por lo que más mueve la aguja, no
por lo que es más fácil.

La parte técnica del sitio está sana: la home carga en ~1 s con 90 KB, la
jerarquía de encabezados es correcta, hay schema de negocio local, sitemap,
páginas legales, cookies y Meta Pixel. **Lo que falta no es casi nada de código:
es contenido, un dominio y medir.**

---

## 1. Fotos — el cuello de botella real

**Diez de los doce bonsáis no tienen galería.** Solo `bequia-pequena` (9
archivos) y `bonsai-mini-juniperus-horizontalis` (5) están publicados. Cuatro
carpetas existen pero están vacías, y seis productos no tienen ni carpeta.

| Producto | Estado |
| --- | --- |
| `bequia-pequena` | 4/6 tomas — faltan escala y maceta |
| `bonsai-mini-juniperus-horizontalis` | 3/6 — faltan perspectiva, escala y maceta |
| `guayacan`, `juniperus-shakan`, `arbol-del-te`, `bequia-imperial` | carpeta vacía |
| `azalea`, `pino-estrella`, `bosque-guayacanes`, `junipero-dorado`, `junipero-shakan-mayor`, `flor-arana` | sin carpeta |

Mientras un árbol no tenga fotos, su ficha enseña una sola imagen del catálogo y
la página no convence. No hay material en bruto esperando: los `originales/` solo
existen para los dos que ya están hechos, así que **hay que fotografiar diez
árboles**.

El orden lo decide el precio: `bequia-imperial` ($150) y
`junipero-shakan-mayor` ($70) son los que más dinero tienen parado.

La pestaña **Fotos pendientes** del panel te dice, en cada momento, qué falta.
Deja los archivos en `Images/productos/<id>/` nombrados `1-principal.webp`,
`2-tronco.webp`, `3-follaje.webp`, `4-escala.webp`, `5-maceta.webp` y publica.

**Esfuerzo:** una tarde de fotos por lote, sin tocar código.

---

## 2. Las seis fichas que faltan

Estos seis salen en la home pero no tienen página propia, así que su tarjeta
manda directo a WhatsApp y no hay nada que Google pueda indexar:

`azalea` ($30) · `pino-estrella` ($35) · `bosque-guayacanes` ($45) ·
`junipero-dorado` ($25) · `junipero-shakan-mayor` ($70) · `flor-arana` ($25)

Son **$230 de catálogo sin página**. Cada ficha es una entrada en
`productos.json` con el mismo formato que las seis que ya existen. Hasta que las
tengas, valora apagarlas desde el panel: mejor un catálogo de seis que sostiene
que uno de doce donde la mitad decepciona.

**Esfuerzo:** ~1 h por ficha una vez tengas las fotos.

---

## 3. Dominio propio

`decogarden.pages.dev` es lo que más te frena, por dos motivos a la vez: pierde
confianza en el momento de comprar y pierde autoridad en Google. Un `.ec` o un
`.com` cuesta ~$12 al año.

El cambio es pequeño porque el dominio está en cinco sitios, y el HTML se
regenera solo:

- `generar-productos.py:762` y `generar-blog.py:53` — la constante `SITIO`
- `generar-guia.py:91` y `guia-secreto.json`
- `robots.txt` — la línea del sitemap

De paso conviene sacarlo a un solo archivo (`sitio.json` o similar) para que la
próxima vez sea un cambio en un sitio y no en cinco. Después: apuntar el dominio
en Cloudflare Pages y dejar `pages.dev` redirigiendo, para no perder lo poco que
ya esté indexado.

**Esfuerzo:** una tarde, la mayor parte esperando al DNS.

---

## 4. Medir lo que pasa

Hoy solo hay **Meta Pixel** (`pixel.js`), que sirve para anuncios pero no te
dice qué artículo del blog funciona ni por dónde se cae la gente.

- **Google Search Console** — el archivo de verificación
  (`google63590f157f3d71e1.html`) ya está subido, así que es entrar y reclamar
  la propiedad. Es la única forma de saber por qué búsquedas te encuentran.
- **Google Business Profile** — para "bonsái Ibarra" y "vivero Imbabura", una
  ficha de negocio pesa más que cualquier cosa que hagas en la web. Gratis.
- **Analítica de contenido** — GA4, o algo ligero tipo Plausible si prefieres no
  meter más scripts de Google.

Hazlo **antes** de escribir más blog. Publicar sin medir es escribir a ciegas.

**Esfuerzo:** una mañana.

---

## 5. Blog: cadencia

Hay un artículo. Para que el blog empiece a traer visitas hacen falta entre
ocho y doce, publicados con constancia. Temas que ya sabes responder porque te
los preguntan por WhatsApp:

- Por qué se ponen amarillas las hojas
- Cuándo y cómo podar sin matarlo
- Qué bonsái elegir si es tu primero
- Bonsái de interior o de exterior en el clima de la sierra
- Cómo trasplantar y cada cuánto
- Qué pasa si te vas de viaje

Uno cada dos semanas durante tres meses. Enlázalos entre ellos y a las fichas:
eso es lo que hace que Google entienda de qué va el sitio.

---

## 6. Conversión

**Captura de correo: hoy no hay ninguna.** El blog va a traer gente que no
compra ese día, y ahora mismo se pierde entera. Un formulario simple al final de
cada artículo ("te aviso cuando llegue un lote nuevo") recupera esa visita. Ojo:
recoger correos activa obligaciones de la ley de protección de datos, así que la
casilla de consentimiento y el enlace a la política tienen que estar.

**Reseñas: hay tres** en el schema de la home. Son el activo más barato que
tienes: pide una por WhatsApp a cada cliente a los 15 días de la entrega, cuando
el árbol ya se adaptó. Verifica que las tres actuales sean de clientes reales y
que puedas demostrarlo — Google penaliza a mano las reseñas inventadas, y el
daño es difícil de revertir.

**Pago en línea:** todo termina en WhatsApp. Para Ecuador y para tu volumen eso
está bien por ahora; el cierre por WhatsApp convierte mejor que una pasarela mal
integrada. Revísalo cuando te cueste responder a todos, no antes.

---

## 7. Panel, fase 2

Lo que hoy obliga a salir del panel:

- **Subir fotos** — hay que copiar archivos a mano a `Images/productos/<id>/`.
  Es lo primero que le añadiría.
- **Editar las fichas largas** — el panel edita `catalog.json`, pero el texto
  extenso de `productos.json` sigue siendo a mano.
- **Publicar desde el móvil** — Cloudflare Functions + un token de GitHub en
  variables de entorno, con Cloudflare Access delante. La interfaz ya está hecha
  para esto: solo cambia a dónde apunta *Guardar*.

---

## 8. Robustez

Cosas que no se ven pero que muerden:

- ~~El `lastmod` del blog sale de la fecha del archivo.~~ **Hecho el 28 de
  septiembre.** Ahora sale del campo `actualizado` de `blog.json`, que el panel
  sella cuando editas el texto. Un `clone`, un `checkout` o restaurar una copia
  ya no mueven la fecha; retocar el CSS o la plantilla tampoco, y está bien que
  no lo hagan: a Google le importa si cambió lo que se lee.
- **No hay pruebas.** El convertidor de Markdown y los validadores del panel son
  código con lógica de verdad y ninguna red debajo. Media docena de pruebas
  cubrirían lo que importa.
- **No hay CI.** Una acción de GitHub que corra los dos generadores y falle si el
  HTML del repositorio no coincide con el que sale evitaría publicar a medias.
- **OG por producto: 6 de 12.** Los que no tienen ficha comparten la imagen
  genérica al enviarlos por WhatsApp. Se arregla solo cuando tengan fotos.

---

## Por dónde empezar

Si solo puedes con tres cosas este mes:

1. **Fotografía `bequia-imperial` y `junipero-shakan-mayor`** — $220 parados.
2. **Reclama Search Console y abre Google Business Profile** — una mañana, y
   empiezas a saber qué está pasando.
3. **Compra el dominio** — cuanto antes lo hagas, menos autoridad tiras a la
   basura mientras tanto.

Lo demás va después, y va mejor cuando estas tres están hechas.
