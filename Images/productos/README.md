# Fotos y videos de cada bonsái

## Cómo se usa

1. Dejas los archivos en la carpeta del producto.
2. Ejecutas `python generar-productos.py`.
3. Listo. No hay que declarar nada en ningún archivo.

Cada carpeta se llama igual que el **id** del producto en `catalog.json`:

```
Images/productos/
  juniperus-shakan/
  bequia-pequena/
  guayacan/
  arbol-del-te/
```

## Nombra los archivos así

El **número del inicio manda el orden** y el **nombre define el texto alternativo**
(lo que lee Google y lo que escucha una persona con lector de pantalla). Si usas
estos nombres, ese texto se escribe solo:

| Nombre del archivo | Para qué sirve |
|---|---|
| `1-principal.webp` | La foto bonita, la que enamora. Es la primera que se ve. |
| `2-frontal.webp` | El árbol completo de frente, sin recortes. Para entender la forma. |
| `3-tronco.webp` | Primer plano del tronco y la base. Ahí se ven los años de trabajo. |
| `4-escala.webp` | El bonsái junto a una mano, una taza o un libro. |
| `5-entrega.webp` | Cómo llega empacado. |
| `6-giro.mp4` | Video corto girando alrededor del árbol. |

Otros nombres que también reconoce: `follaje`, `hoja`, `maceta`, `raiz`, `empaque`,
`conjunto` (el árbol junto a otros del vivero), `video`.

Si usas un nombre distinto igual funciona, solo que el texto alternativo queda
genérico (el nombre del producto). Nada se rompe.

**La foto de escala es la más subestimada.** Responde "¿qué tan grande es?" mejor
que cualquier medida escrita, y es la duda que más frena una compra por internet.

## Formatos

**Fotos → WebP**

- Tamaño: **1600 × 1600 px**, cuadradas. La galería las muestra cuadradas y el
  zoom llega hasta 1200 px, así que 1600 alcanza y sobra.
- Peso: apunta a **menos de 200 KB** por foto. Las que ya tienes están entre
  67 y 176 KB, ese es el rango correcto.
- Calidad al exportar: **80**. Arriba de eso pesa mucho más sin verse mejor.

**Videos → MP4 (H.264)**

- 1080 × 1080 (cuadrado) o 1080p.
- **10 a 20 segundos**, sin audio o silenciado — nadie lo va a escuchar.
- Peso: **menos de 5 MB**. Cloudflare rechaza archivos de más de 25 MB, pero
  mucho antes de eso el video ya tarda demasiado en cargar en datos móviles.
- Acompáñalo de una portada con el mismo nombre + `-poster`:
  `6-giro.mp4` y `6-giro-poster.webp`. Sin portada, el recuadro se ve negro
  hasta que el video carga.

**Ojo con el celular**

- iPhone guarda en **HEIC**, que los navegadores no muestran. Hay que convertir
  a WebP o JPG antes de subir.
- Una foto de celular pesa entre 3 y 12 MB. Subirla sin optimizar hace la página
  lenta justo en móvil, que es donde te compran.

## Si un producto todavía no tiene fotos

No pasa nada: la página usa la foto que ya está en `catalog.json` y muestra el
recuadro de "Pronto" en las miniaturas.
