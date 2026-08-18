# Fotos y videos de cada bonsái

Cada producto tiene su propia carpeta, nombrada con el **id** que usa en `catalog.json`:

```
Images/productos/
  juniperus-shakan/
    principal.webp
    frontal.webp
    tronco.webp
    escala.webp
    entrega.webp
    giro.mp4
    giro-poster.webp
  bequia-pequena/
    ...
```

## Qué fotos vale la pena tomar

Por orden de impacto en la venta:

1. **principal** — la foto bonita, la que enamora. Es la que se ve primero.
2. **frontal** — el árbol completo, de frente, sin recortes. Para que se entienda la forma.
3. **tronco** — primer plano del tronco y la base. Es donde se ven los años de trabajo.
4. **escala** — el bonsái junto a algo de tamaño conocido (una mano, una taza, un libro).
   Esta resuelve la duda de "¿qué tan grande es?" mejor que cualquier medida escrita.
5. **entrega** — cómo llega empacado. Baja el miedo a que se dañe en el envío.

## Formato

- **Fotos**: `.webp` de preferencia (pesan menos y cargan más rápido). También sirve `.jpg`.
  Cuadradas o casi cuadradas se ven mejor en la galería.
- **Videos**: `.mp4`. Acompáñalo de una imagen `-poster.webp` (el cuadro que se ve antes
  de darle play). Si no pones poster, el video se ve negro hasta que carga.
- Nombra los archivos sin espacios, tildes ni mayúsculas: `tronco.webp`, no `Tronco Árbol.webp`.

## Cómo hacer que aparezcan en la página

Poner el archivo en la carpeta **no basta** — hay que declararlo en `productos.json`,
dentro del producto, en la lista `galeria`:

```json
"galeria": [
  { "src": "Images/productos/juniperus-shakan/principal.webp", "alt": "Bonsái Juniperus Shakan completo" },
  { "src": "Images/productos/juniperus-shakan/tronco.webp", "alt": "Detalle del tronco inclinado" },
  {
    "tipo": "video",
    "src": "Images/productos/juniperus-shakan/giro.mp4",
    "poster": "Images/productos/juniperus-shakan/giro-poster.webp",
    "alt": "Vista del bonsái girando"
  }
]
```

El orden de la lista es el orden en que se muestran. El primero es el principal.

Después ejecuta:

```
python generar-productos.py
```

## Si un producto todavía no tiene galería

No pasa nada: si no declaras `galeria`, la página usa la foto que ya está en
`catalog.json` y muestra el recuadro de "Pronto" en las miniaturas.

## El `alt` importa

Ese texto lo lee Google y lo escuchan las personas que usan lector de pantalla.
Describe lo que se ve, no repitas el nombre del producto en todas:
bien `"Detalle del tronco inclinado"`, mal `"bonsai"` o `"foto 3"`.
