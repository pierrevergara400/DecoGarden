# Test «Encuentra tu bonsái ideal»

Una página que convierte la pregunta «¿cuál me recomiendas?» —la que hoy llega
por WhatsApp— en tres recomendaciones con sus motivos y un botón que abre el
chat con todo ya escrito.

- **En el sitio:** `/encuentra-tu-bonsai`
- **Para editarlo:** `/admin` → pestaña **Test de bonsái**
- **Pruebas del motor:** `/admin/pruebas-test`

> **Estado actual: perfiles validados, modo revisión apagado.** Fotos,
> nombres, precios, especies y alturas son los reales del catálogo. Los perfiles
> del test (luz, cuidado, estilo, dónde ponerlo) los validó DecoGarden el
> 2026-09-29. Falta decidir la indexación y publicar: ver
> [Antes de lanzar](#antes-de-lanzar).

## Regla fija: ni sombra ni interior sin sol

DecoGarden no recomienda ningún bonsái para **poca luz** ni para **luz
indirecta** (interior sin sol directo). Está en `lucesProhibidas` de
`test-bonsai.json` y se cumple en tres sitios:

- el **motor** ignora esas luces aunque un perfil las tenga marcadas a mano;
- el **servidor** no deja guardar un perfil con ellas;
- el **panel** las muestra apagadas, con «(nunca)».

A quien contesta una de esas luces el test le dice que ninguno vivirá bien así y
le ofrece los que funcionan con sol directo, con la condición escrita en cada
tarjeta. Si algún día traes especies de interior, esa regla es lo que habría
que revisar primero.

## Cómo está hecho

Tres piezas separadas, para poder cambiar una sin tocar las otras:

```
public/data/test-bonsai.json    QUÉ se pregunta y CÓMO se decide: preguntas, pesos,
                                textos y el perfil de cada bonsái para el test
public/data/catalog.json        el catálogo de siempre: nombre, precio, foto,
                                especie, altura y etiqueta (Disponible/Vendido…)
public/assets/js/test-motor.js  el motor: sin pantalla, solo reglas
public/assets/js/test.js        la interfaz, la sesión, WhatsApp y la medición
public/assets/css/test.css      el diseño (hoja propia, ligera, móvil primero)
public/encuentra-tu-bonsai.html la página
```

El test **no duplica** el catálogo: el precio y la foto salen de `catalog.json`,
así que cambiar un precio en el panel lo cambia también aquí. El perfil del test
es lo único propio: lo que el catálogo no sabe (qué luz tolera, para quién es…).

No hay compilación ni dependencias: es HTML, CSS y JavaScript sueltos, igual
que el resto del sitio, y se publica con el mismo `git push`.

## El recorrido

1. **Inicio.** Foto, título, «Encontrar mi bonsái», «Solo toma 1 minuto». No
   pide nombre, correo ni teléfono, ni al principio ni al final.
2. **Preguntas**, una por pantalla, con barra de progreso, botón «Atrás» y
   «Prefiero omitir» en las que no son esenciales. Al tocar una opción avanza
   solo. El botón atrás del teléfono vuelve a la pregunta anterior.
3. **Resultados:** hasta tres tarjetas con foto, precio, tamaño, por qué encaja,
   nivel de cuidado y dónde ponerlo, cada una con «Ver detalles» y «Consultar
   por WhatsApp». Debajo, «Ver los 3 por WhatsApp», «Volver a cambiar mis
   respuestas» y «Repetir test».

Las respuestas se guardan en la sesión del navegador: si la persona recarga o
sale y vuelve en la misma pestaña, sigue donde estaba (o ve «Continuar donde lo
dejé»). Se borran al cerrar la pestaña. No salen del teléfono.

### Qué se pregunta y cuándo

| Pregunta | Cuándo aparece |
| --- | --- |
| ¿Para quién es tu bonsái? | Siempre |
| ¿Qué ocasión celebras? | Solo si es para regalar (pregunta extra) |
| ¿Dónde te gustaría colocarlo? | Siempre. En un regalo: «¿Dónde crees que lo pondrá?» |
| ¿Cuánta luz recibe ese lugar? | Siempre, salvo en jardín o terraza (se deduce: exterior) |
| ¿Cuánto tiempo puedes dedicarle? | No en un regalo (se asume «algo sencillo») |
| ¿Qué tamaño prefieres? | No en escritorio (se deduce: pequeño) |
| ¿Cuál es tu presupuesto? | Siempre |
| ~~¿Qué estilo te gusta más?~~ | **Desactivada**: la foto de cada resultado ya enseña el estilo |

Nunca hay más de **5 preguntas principales** (`maxPreguntasPrincipales`). Si un
camino tuviera 6 —por ejemplo, «para mí» en la sala—, se quita la omitible de
menor `prioridad`, que hoy es el tamaño. La ocasión no cuenta: es la extra del
regalo.

La pregunta de estilo sigue en `test-bonsai.json` con `"desactivada": true`: no
se pregunta ni puntúa, y el panel esconde sus casillas, pero los estilos de cada
perfil se conservan. Para volver a preguntarla, borra esa línea (y sube
`maxPreguntasPrincipales` a 6 si no quieres perder la de tamaño).

## Cómo decide el motor

1. **Quién puede entrar.** Un bonsái necesita perfil en `test-bonsai.json`,
   estar publicado en el catálogo, no estar vendido ni reservado (lo lee de la
   etiqueta) y tener el perfil validado. En modo revisión entran también los no
   validados.
2. **La luz filtra, no puntúa.** Si la persona dice «poca luz» y un bonsái no la
   tolera, no aparece aunque encaje en todo lo demás. Si con esa luz no queda
   ninguno, el test lo dice y ofrece los que vivirían con otra luz
   (`luzAlternativa`: con poca luz → sol directo), con la condición escrita en
   cada tarjeta: «Solo si puedes darle sol directo varias horas». Si tampoco
   hay de esos, no recomienda nada y ofrece hablar por WhatsApp.
   Con «No estoy seguro» no filtra, pero cada tarjeta dice qué luz necesita.
3. **Puntos** por cada coincidencia, con los pesos de `pesos`: presupuesto 4,
   lugar 3, estilo 3 (hoy no, porque la pregunta está desactivada), cuidado 3, tamaño 2 (1 si es el tamaño vecino), ocasión 2,
   uso 1. Quien pidió «algo sencillo» resta 3 a los que no son fáciles, y la
   tarjeta lo avisa.
4. **Presupuesto.** Primero los que entran en el rango. Si no llegan a tres, se
   completa con los más cercanos (pasarse cuenta el doble que quedarse corto),
   con la etiqueta «Alternativa cercana» y cuánto se pasa.
5. **Variedad.** Una especie ya elegida resta 1,5 a las siguientes de la misma
   especie: tres juníperos casi iguales no son tres opciones.
6. **Hasta tres, nunca inventados.** Si solo dos cumplen el filtro de luz,
   salen dos, con un texto que explica por qué.
7. **Una colección, aparte.** Debajo de los tres puede salir una colección
   (ver [Colecciones](#colecciones)). No ocupa ninguno de los tres puestos.

Un precio sin número («Por definir») nunca cuenta como «entra en tu
presupuesto»: la tarjeta dice «Precio por confirmar».

Los títulos se adaptan: «Estos 3 bonsáis podrían enamorarte» cuando encajan, y
«Lo más cercano a lo que buscas» cuando ninguno cumple la luz o el presupuesto.
La primera tarjeta lleva «Tu mejor coincidencia» solo si cumple de verdad.

## Colecciones

Varios árboles en un solo pedido, para subir el ticket de quien compra más de
uno: el Set Consultorio, una colección de cítricos… Viven en `colecciones` de
`test-bonsai.json` y se editan en el panel, al final de la pestaña **Test de
bonsái**.

- El test ofrece **como mucho una**, en una tarjeta ancha debajo de los tres
  bonsáis («Para llevar más de uno»), con su propio «Ver detalles» y
  «Consultar por WhatsApp» («…me interesa el Set Consultorio. También me
  recomendaron: …»).
- Pasa **el mismo filtro de luz** que los productos, con la misma regla de
  nunca sombra ni interior sin sol.
- Por precio, sale si cabe en el presupuesto o si la persona eligió uno de
  `ajustesColecciones.presupuestosAbiertos` (hoy: «Quiero conocer opciones»,
  $40–$70 y más de $70); si se pasa, la tarjeta dice cuánto. A quien pidió
  «Hasta $20» no se le ofrece un set de $99.
- Necesita un mínimo de puntos (`puntosMinimos`, hoy 3): encajar al menos en el
  lugar, o en el uso y algo más. Si no, no se ofrece.
- Si nombra productos del catálogo (`productos`), se enseñan sus fotos y **solo
  se ofrece si todos están publicados y sin vender**. Si las piezas se eligen
  con el cliente, se deja vacío y se describen en «Qué incluye».
- Igual que un producto: se enciende con el interruptor y necesita el perfil
  validado.

Hoy hay dos, **apagadas**:

| Colección | Estado |
| --- | --- |
| Set Consultorio | Precio ($99) y contenido del bloque oculto de la home. Falta foto, confirmar stock y validar el perfil. |
| Colección Cítricos | DEMO: Calamondín + Mandarina. Falta precio, foto, descripción y validar el perfil. |

## Productos DEMO

Para preparar lo que todavía no está en la web hay tres productos de
demostración en `catalog.json`: **Gardenia, Calamondín y Mandarina**. Están
marcados así:

- `activo: false`: no salen en la home, ni en el sitemap, ni en el test.
- Precio «Por definir», especie, altura y edad vacías.
- Foto provisional `Images/pendiente.svg` («Foto pendiente»).
- La descripción empieza por «DEMO —».
- Su perfil del test es una propuesta sin validar (luz de sol y exterior, como
  todo el catálogo; nunca sombra).

Para publicar uno: panel → **Productos** → Editar → pon precio, foto (en
`Images/productos/<id>/`), especie, altura, edad y descripción → enciéndelo.
Luego **Test de bonsái** → revisa su perfil → Validado → Guardar → Publicar.

El panel y el servidor **no dejan encender** un producto o una colección sin
precio con número o con la foto provisional: sería enseñar un «Por definir» o un
«Foto pendiente» en la web.

### Vista previa de borradores

Para ver cómo quedará algo antes de encenderlo, en tu máquina:

```
http://localhost:8435/encuentra-tu-bonsai?borradores=1
```

El test incluye entonces lo apagado y lo no validado, con una etiqueta amarilla
«Borrador» y un aviso arriba. Lo vendido y la regla de luz se siguen
respetando. En la web publicada el parámetro no hace nada.

## WhatsApp

Número: `whatsapp` en `test-bonsai.json` (hoy `593963136655`). Cada botón abre
`wa.me` con el mensaje escrito; la persona decide si lo envía. Ejemplo:

```
Hola, DecoGarden. Hice el test de bonsáis y me interesa el Guayacán.
También me recomendaron: Árbol del Té o Mānuka y Junípero Cascada Mini.
¿Está disponible y cuánto sale el envío a mi ciudad?

Mis respuestas: Para regalar (cumpleaños) · lugar: escritorio · luz: sol directo
varias horas · presupuesto: $20 – $40.
· web/test-bonsai-oct
```

- Pregunta por la disponibilidad y el envío; **no afirma** que haya stock ni
  que el envío sea gratis. Tampoco lo hace la página: debajo de los resultados
  dice que eso se confirma por WhatsApp.
- **No pide «precio actualizado»** ni habla de «precios de referencia»: el
  precio ya se le enseñó, y ponerlo en duda abre la puerta a regatear.
- «Mis respuestas» lleva solo lo que la persona contestó, no lo deducido.
- La última línea (`· web/...`) la añade `origen.js` cuando la visita viene de
  una campaña: es lo que te dice en el chat de qué anuncio llegó.

## Campañas y UTM

El enlace se puede mandar por WhatsApp, Instagram, Facebook o anuncios. Añádele
UTM y cada conversación llega marcada:

```
https://decogarden.pages.dev/encuentra-tu-bonsai?utm_source=instagram&utm_medium=bio&utm_campaign=test-bonsai
https://decogarden.pages.dev/encuentra-tu-bonsai?utm_source=meta&utm_medium=ads&utm_campaign=regalos-dic
https://decogarden.pages.dev/encuentra-tu-bonsai?utm_source=whatsapp&utm_medium=estado&utm_campaign=test-bonsai
```

- En el chat verás `· web/<utm_campaign>` (o `utm_source` si no hay campaña, o
  `meta` si el anuncio trae `fbclid`). Máximo 24 caracteres: usa nombres cortos.
- En GA4, las UTM se asocian solas a la sesión y a todos sus eventos.

## Medición

Solo si la persona **aceptó las cookies** (la misma cookie `dg_consent` del
aviso del sitio). Rechazar es no cargar nada, igual que con el píxel. No se
envía ningún dato personal: el test no los pide.

| Evento | Cuándo | Datos |
| --- | --- | --- |
| `test_inicio` | Pulsa «Encontrar mi bonsái» o «Repetir test» | `repetido` |
| `test_respuesta` | Cada respuesta u omisión | `pregunta`, `respuesta`, `paso` |
| `test_completado` | Termina la última pregunta | `preguntas` |
| `test_resultados` | Ve los resultados | `estado`, `cantidad`, `productos`, `coleccion` |
| `test_producto_click` | «Ver detalles» o «Ver ficha completa» | `producto`, `posicion`, `accion` |
| `test_whatsapp_click` | Cualquier botón de WhatsApp | `producto` (o `todos`/`ninguno`), `posicion`, `estado` |

Una colección llega como `producto: "coleccion:<id>"` y `posicion: 4`.

Salen a la vez a:

- **Meta Pixel** como eventos personalizados (`trackCustom`). Además, el píxel
  ya cuenta cualquier clic a WhatsApp como `Contact`.
- **GA4**, si pones el ID (`G-XXXXXXX`) en el panel. Vacío, no se carga.
- **`dataLayer`**, por si algún día usas Google Tag Manager.

Para verlos sin enviar nada: abre la página con `?debug=1` y mira la consola.

Embudo sugerido: `test_inicio` → `test_completado` → `test_resultados` →
`test_whatsapp_click`, y en WhatsApp la marca `web/...` para cerrar el círculo
hasta la venta.

## El día a día

### Cambiar un precio

Como siempre: panel → **Productos** → Editar → Precio → Guardar → Publicar.
El test lo toma de `catalog.json`; no hay nada que tocar aquí.

### Un bonsái se vendió o está reservado

Panel → **Productos** → cambia la etiqueta a «Vendido» o «Reservado» (o
apágalo). El test deja de recomendarlo en cuanto publiques. Si quieres sacarlo
solo del test y no de la home: pestaña **Test de bonsái** → «Disponibilidad en
el test» → «Agotado: no recomendar».

### Añadir un bonsái al test

1. Que exista en el catálogo (pestaña **Productos**).
2. Pestaña **Test de bonsái** → «Añadir al test».
3. Marca las luces con las que vive bien, dónde encaja, estilos, para quién,
   ocasiones y el tiempo de cuidado que acepta. Escribe la luz, la ubicación y
   el riego con tus palabras: es lo que lee el cliente.
4. Marca **Validado por DecoGarden** y guarda.

El tamaño se deduce de la altura (hasta 22 cm pequeño, hasta 40 mediano, más
grande); puedes fijarlo a mano en el perfil.

### Cambiar preguntas, textos o pesos

A mano en `public/data/test-bonsai.json` (el panel solo edita los perfiles, el
número y el modo revisión). Las preguntas, sus opciones, los textos de cada
estado y los pesos están ahí, comentados. Después abre `/admin/pruebas-test`:
si una regla se rompió, lo dice.

No cambies los `id` de las opciones sin revisar los perfiles: el servidor
rechaza guardar un perfil con una luz que el test no conoce.

## Antes de lanzar

Hecho:

- ~~Validar los 12 perfiles~~: validados por DecoGarden el 2026-09-29, luz
  incluida. Las dos Bequias son *Tsuga canadensis*: exterior con luz natural.
- ~~Apagar el modo revisión~~: apagado. Desde ahora solo se recomiendan
  perfiles validados; uno nuevo nace sin validar y no sale hasta que lo marques.

Pendiente, a tu decisión:

1. En `public/encuentra-tu-bonsai.html`, **quita** la línea
   `<meta name="robots" content="noindex, follow">` si quieres que Google la
   indexe. Si la usas solo para anuncios y redes, puedes dejarla.
2. (Opcional) Pon el ID de **GA4** en el panel.
3. (Opcional) Enlázala desde la home. No lo hice: la home es tuya y no la toqué.
4. **Publicar** en el panel y `git push`. Cloudflare la sirve en
   `/encuentra-tu-bonsai`.

## Pruebas

`/admin/pruebas-test` corre las comprobaciones sobre la configuración real y
catálogos de laboratorio, entre ellas:

- nunca más de 5 preguntas principales, en cualquier combinación
- la pregunta de estilo no sale en ningún camino
- la luz filtra: con «poca luz» no sale nada que necesite sol sin decirlo
- nunca se recomienda para poca luz ni luz indirecta, aunque un perfil lo diga
- los productos publicados tienen el perfil validado y el test no está en revisión
- los DEMO están apagados y no salen en el test publicado
- la colección va aparte, pasa el filtro de luz, respeta el presupuesto y no se
  ofrece si le falta un producto
- la vista previa de borradores nunca incluye vendidos ni luz incompatible
- un precio «Por definir» nunca cuenta como dentro del presupuesto
- sin ningún compatible, la lista queda vacía en vez de rellenarse
- presupuesto sin coincidencias: alternativas marcadas y ordenadas por cercanía
- «Hasta $20» con el catálogo real da los de $20 como coincidencia, no como alternativa
- vendidos, reservados, apagados y sin validar no se recomiendan
- el mensaje de WhatsApp nombra los productos y no promete stock ni envío gratis
- cada perfil apunta a un producto que existe y solo usa luces conocidas

Revisado a mano en móvil (375 px) y escritorio: el recorrido completo, atrás y
adelante con el botón del navegador, recargar a mitad del test, omitir,
detalles, la marca de campaña en WhatsApp y los eventos con y sin
consentimiento.
