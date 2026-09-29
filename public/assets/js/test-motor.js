/* ==========================================================================
   test-motor.js — el motor del test «Encuentra tu bonsái ideal».

   Solo lógica: no toca el DOM, no lee la URL, no guarda nada. Recibe el
   catálogo, la configuración (data/test-bonsai.json) y las respuestas, y
   devuelve qué preguntas mostrar y qué bonsáis recomendar. Por eso se puede
   probar entero sin pantalla: /admin/pruebas-test lo ejercita.

   Cómo decide, en orden:

   1. Quién puede entrar. Un bonsái necesita perfil en test-bonsai.json, estar
      publicado en el catálogo, no estar vendido ni reservado, y tener el perfil
      validado (salvo en modo revisión).
   2. La luz es un FILTRO, no una puntuación. Si la persona dijo «poca luz» y
      un bonsái no la tolera, no aparece, por muchos puntos que sumara en lo
      demás. Las luces de config.lucesProhibidas no las tolera ninguno. Si no queda ninguno, se ofrecen los que vivirían con otra luz,
      diciendo con todas las letras que es con esa condición.
   3. Lo demás suma puntos con los pesos de la configuración: lugar, estilo,
      presupuesto, tamaño, ocasión, cuidado y uso.
   4. El presupuesto separa: primero lo que entra en el rango; si no llegan a
      tres, se completa con lo más cercano, marcado como alternativa.
   5. Se devuelven hasta tres distintos. Si hay menos, se devuelven menos:
      nunca se rellena con algo que no cumpla el filtro de luz.
   6. Aparte, como mucho una colección (varios árboles en un solo pedido),
      con el mismo filtro de luz y los mismos puntos. No ocupa ninguno de los
      tres puestos: se ofrece debajo, para quien quiera llevar más de uno.
   ========================================================================== */

(function (raiz) {
  'use strict';

  const NO_SABE = 'nose';

  /* --- Catálogo --------------------------------------------------------- */

  function precioNumero(precio) {
    const m = String(precio || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function alturaCm(altura) {
    const m = String(altura || '').match(/\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : null;
  }

  function tamanoDe(cm, umbrales) {
    if (cm == null) return null;
    if (cm <= umbrales.pequeno) return 'pequeno';
    if (cm <= umbrales.mediano) return 'mediano';
    return 'grande';
  }

  /* El panel marca así lo que ya no se puede comprar. app.js usa la misma
     regla para los datos estructurados de la home. */
  function agotado(item, perfil) {
    if (perfil && perfil.stock === 'agotado') return true;
    const texto = String(item.badgeTexto || '').toLowerCase();
    return /vendido|reservado|agotado/.test(texto);
  }

  /* Las luces que DecoGarden no acepta nunca (sombra, interior sin sol) se
     quitan del perfil aquí, antes de filtrar: aunque alguien las marque a
     mano en el JSON, ningún bonsái se recomienda para esas condiciones. */
  function sinLucesProhibidas(perfil, prohibidas) {
    if (!perfil || !prohibidas.length) return perfil;
    return Object.assign({}, perfil, {
      luz: (perfil.luz || []).filter((l) => !prohibidas.includes(l)),
    });
  }

  /* Junta cada producto del catálogo con su perfil del test y calcula lo que
     se deduce (precio en número, tamaño). No filtra: eso lo hace recomendar(),
     que así puede contar cuántos quedaron fuera y por qué. */
  function prepararProductos(catalogo, config) {
    const perfiles = (config && config.perfiles) || {};
    const umbrales = config.tamanos || { pequeno: 22, mediano: 40 };
    const prohibidas = config.lucesProhibidas || [];
    return (catalogo || []).map((item) => {
      const perfil = sinLucesProhibidas(perfiles[item.id] || null, prohibidas);
      const cm = alturaCm(item.altura);
      return {
        id: item.id,
        item,
        perfil,
        precio: precioNumero(item.precio),
        cm,
        tamano: (perfil && perfil.tamano) || tamanoDe(cm, umbrales),
        activo: item.activo !== false,
        agotado: agotado(item, perfil),
      };
    });
  }

  /* Las colecciones de test-bonsai.json, con la misma forma que un producto
     para que el motor las puntúe igual. Una colección que nombra productos
     del catálogo solo está disponible si lo están todos: no se ofrece un set
     de cítricos si uno de los dos se vendió. */
  function prepararColecciones(config, productos) {
    const colecciones = (config && config.colecciones) || {};
    const prohibidas = config.lucesProhibidas || [];
    const porId = new Map((productos || []).map((p) => [p.id, p]));
    return Object.keys(colecciones).filter((id) => !id.startsWith('_')).map((id) => {
      const c = colecciones[id];
      const ids = c.productos || [];
      const piezas = ids.map((pid) => porId.get(pid)).filter(Boolean);
      return {
        id,
        tipo: 'coleccion',
        item: {
          id,
          nombre: c.nombre || id,
          articulo: c.articulo || 'la',
          precio: c.precio || '',
          detallePrecio: c.detallePrecio || '',
          imagen: c.imagen || '',
          descripcion: c.descripcion || '',
          incluye: c.incluye || [],
        },
        piezas,
        perfil: sinLucesProhibidas(c.perfil || null, prohibidas),
        precio: precioNumero(c.precio),
        tamano: null,
        activo: c.activo !== false && piezas.every((x) => x.activo),
        agotado: (c.perfil && c.perfil.stock === 'agotado') || piezas.length < ids.length
          || piezas.some((x) => x.agotado),
      };
    });
  }

  /* --- Preguntas -------------------------------------------------------- */

  function cumple(condicion, respuestas) {
    return Object.keys(condicion || {}).every((clave) =>
      (condicion[clave] || []).includes(respuestas[clave]));
  }

  function inferida(pregunta, respuestas) {
    const regla = (pregunta.inferir || []).find((r) => cumple(r.si, respuestas));
    return regla ? regla.valor : undefined;
  }

  /* Las preguntas que toca mostrar con estas respuestas.

     Una pregunta se salta si su condición no se cumple (la ocasión solo si es
     regalo) o si su respuesta se deduce de otra (en el jardín la luz es de
     exterior). Si aun así quedan más principales que el máximo, se quitan las
     omitibles de menor prioridad: el test tiene que durar un minuto.

     Las condiciones solo miran preguntas anteriores, así que la lista es
     estable mientras la persona avanza. */
  function preguntasVisibles(config, respuestas) {
    const r = respuestas || {};
    // «desactivada» saca una pregunta del test sin borrarla de la configuración.
    const lista = config.preguntas.filter((p) => !p.desactivada
      && (!p.mostrarSi || cumple(p.mostrarSi, r)) && inferida(p, r) === undefined);

    const maximo = config.maxPreguntasPrincipales || Infinity;
    const principales = () => lista.filter((p) => !p.condicional).length;
    while (principales() > maximo) {
      const candidatas = lista.filter((p) => p.omitible && !p.condicional);
      if (!candidatas.length) break;
      const menor = candidatas.reduce((a, b) => ((b.prioridad || 0) < (a.prioridad || 0) ? b : a));
      lista.splice(lista.indexOf(menor), 1);
    }
    return lista;
  }

  /* Las respuestas que usa el motor: lo que contestó la persona más lo que se
     dedujo. Una pregunta deducida no se muestra, así que lo deducido pisa una
     respuesta vieja: quien cambia a «jardín» ya no tiene la luz de la sala.
     Lo que la persona omitió
     o no se llegó a preguntar queda sin valor, que para el motor es «me da
     igual». */
  function respuestasEfectivas(config, respuestas) {
    const r = Object.assign({}, respuestas || {});
    const visibles = new Set(preguntasVisibles(config, r).map((p) => p.id));
    config.preguntas.forEach((p) => {
      if (p.mostrarSi && !cumple(p.mostrarSi, r)) { delete r[p.id]; return; }
      const valor = inferida(p, r);
      if (valor !== undefined) r[p.id] = valor;
      else if (!visibles.has(p.id)) delete r[p.id];
    });
    return r;
  }

  function opcion(config, preguntaId, opcionId) {
    const p = config.preguntas.find((x) => x.id === preguntaId);
    return p && p.opciones.find((o) => o.id === opcionId);
  }

  function textoOpcion(config, preguntaId, opcionId) {
    const o = opcion(config, preguntaId, opcionId);
    return o ? o.texto : '';
  }

  /* --- Recomendación ---------------------------------------------------- */

  function plantilla(texto, datos) {
    return String(texto || '').replace(/\{(\w+)\}/g, (_, k) => (datos[k] != null ? datos[k] : ''));
  }

  function rangoDe(config, respuesta) {
    return (config.presupuestos || {})[respuesta] || null;
  }

  /* Un precio sin número («Por definir») no entra en ningún rango: no se le
     puede decir a nadie que algo cabe en su presupuesto sin saber cuánto vale. */
  function enRango(precio, rango) {
    if (!rango) return true;
    if (precio == null) return false;
    if (rango.min != null && precio < rango.min) return false;
    if (rango.max != null && precio > rango.max) return false;
    return true;
  }

  /* Cuánto se aleja un precio del rango: 0 dentro. Pasarse cuenta el doble
     que quedarse corto, porque quedarse corto no le duele a nadie. */
  function distanciaRango(precio, rango) {
    if (!rango) return 0;
    if (precio == null) return Infinity;
    if (rango.max != null && precio > rango.max) return (precio - rango.max) * 2;
    if (rango.min != null && precio < rango.min) return rango.min - precio;
    return 0;
  }

  const ORDEN_TAMANOS = ['pequeno', 'mediano', 'grande'];

  function puntuar(p, r, config) {
    const w = config.pesos || {};
    const razones = config.razones || {};
    const perfil = p.perfil;
    const out = { puntos: 0, razones: [], avisos: [] };
    const suma = (peso, razon) => {
      out.puntos += peso || 0;
      if (razon) out.razones.push(razon);
    };

    if (r.luz && r.luz !== NO_SABE && perfil.luz.includes(r.luz)) {
      // No suma: todos los que llegan aquí ya la cumplen. Solo explica.
      if (razones.luz && razones.luz[r.luz]) out.razones.push(razones.luz[r.luz]);
    }

    if (r.lugar && r.lugar !== NO_SABE && (perfil.lugares || []).includes(r.lugar)) {
      suma(w.lugar, razones.lugar && razones.lugar[r.lugar]);
    }

    if (r.estilo && r.estilo !== 'sorpresa' && (perfil.estilos || []).includes(r.estilo)) {
      suma(w.estilo, razones.estilo && razones.estilo[r.estilo]);
    }

    if (r.tamano && r.tamano !== 'indiferente' && p.tamano) {
      const d = Math.abs(ORDEN_TAMANOS.indexOf(r.tamano) - ORDEN_TAMANOS.indexOf(p.tamano));
      if (d === 0) suma(w.tamano, razones.tamano && razones.tamano[r.tamano]);
      else if (d === 1) suma(w.tamanoVecino);
    }

    if (r.para === 'regalo' && r.ocasion && (perfil.ocasiones || []).includes(r.ocasion)) {
      suma(w.ocasion, razones.ocasion && razones.ocasion[r.ocasion]);
    }

    if (r.cuidado) {
      if ((perfil.cuidado || []).includes(r.cuidado)) {
        suma(w.cuidado, razones.cuidado && razones.cuidado[r.cuidado]);
      } else if (r.cuidado === 'sencillo' && perfil.dificultad !== 'facil') {
        out.puntos += w.cuidadoExigente || 0;
        if (razones.cuidadoExigente) out.avisos.push(razones.cuidadoExigente);
      }
    }

    if (r.para && (perfil.usos || []).includes(r.para)) {
      suma(w.uso, razones.uso && razones.uso[r.para]);
    }

    const rango = rangoDe(config, r.presupuesto);
    out.enPresupuesto = enRango(p.precio, rango);
    out.distancia = distanciaRango(p.precio, rango);
    if (p.precio == null) {
      if (razones.precioPendiente) out.avisos.push(razones.precioPendiente);
    } else if (rango && out.enPresupuesto) {
      suma(w.presupuesto, plantilla(razones.presupuesto, { rango: rango.texto }));
    } else if (rango && rango.max != null && p.precio > rango.max) {
      out.avisos.push(plantilla(razones.sobrePresupuesto, {
        // Hacia arriba y como mínimo $1: «se pasa $0» no se entiende.
        diferencia: Math.max(1, Math.ceil(p.precio - rango.max)),
      }));
    } else if (rango) {
      out.razones.push(razones.bajoPresupuesto);
    }

    if (r.luz === NO_SABE || !r.luz) {
      out.avisos.push(plantilla(razones.luzDudosa, { luzTexto: perfil.luzTexto || '' }));
    }

    // Las razones se enseñan en este orden, y en la tarjeta caben unas pocas:
    // primero lo que la persona eligió con intención, al final lo implícito.
    out.razones.sort((a, b) => prioridadRazon(a, razones) - prioridadRazon(b, razones));
    return out;
  }

  const ORDEN_RAZONES = ['ocasion', 'lugar', 'estilo', 'presupuesto', 'luz', 'cuidado', 'tamano', 'uso'];

  function prioridadRazon(texto, razones) {
    const i = ORDEN_RAZONES.findIndex((clave) => {
      const r = razones[clave];
      if (typeof r === 'string') return texto.startsWith(r.split('{')[0]);
      return r && Object.values(r).includes(texto);
    });
    return i < 0 ? ORDEN_RAZONES.length : i;
  }

  function ordenar(a, b) {
    return (b.puntos - a.puntos) || ((a.producto.precio || 0) - (b.producto.precio || 0))
      || a.producto.id.localeCompare(b.producto.id);
  }

  /* Elige de uno en uno, restando un poco a los de una especie ya elegida:
     tres juníperos casi iguales no son tres opciones. */
  function elegirDiversos(lista, cuantos, yaElegidos, config) {
    const castigo = (config.pesos && config.pesos.mismaEspecie) || 0;
    const restantes = lista.slice();
    const elegidos = [];
    const especies = (yaElegidos || []).map((e) => especieDe(e.producto));
    while (elegidos.length < cuantos && restantes.length) {
      let mejor = 0;
      let mejorValor = -Infinity;
      restantes.forEach((c, i) => {
        const repetidas = especies.filter((e) => e === especieDe(c.producto)).length;
        const valor = c.puntos + castigo * repetidas;
        if (valor > mejorValor) { mejorValor = valor; mejor = i; }
      });
      const elegido = restantes.splice(mejor, 1)[0];
      elegidos.push(elegido);
      especies.push(especieDe(elegido.producto));
    }
    return elegidos;
  }

  function especieDe(p) {
    return String(p.item.especie || p.id).toLowerCase().split(/[\s']/)[0];
  }

  /* El corazón del test. Devuelve:

       estado        'exacto' | 'parcial' | 'pocos' | 'fuera-presupuesto' |
                     'luz-alternativa' | 'sin-compatibles'
       resultados    hasta 3 × { producto, puntos, razones, avisos,
                                 alternativa, condicionLuz }
       luzAlternativa  la luz con la que funcionan, si estado es luz-alternativa
       coleccion     { producto, puntos, razones, avisos, alternativa,
                       condicionLuz } o null
       descartes     cuántos quedaron fuera y por qué
       revision      true si algún resultado tiene el perfil sin validar

     opciones:
       cuantos       cuántos productos (3)
       colecciones   lo que devuelve prepararColecciones()
       borradores    true = incluir apagados y sin validar. Solo para la vista
                     previa local: lo agotado y la luz se siguen respetando.
  */
  function disponible(p, config, borradores, descartes) {
    if (!p.perfil) { if (descartes) descartes.sinPerfil++; return false; }
    if (p.agotado) { if (descartes) descartes.agotado++; return false; }
    if (borradores) return true;
    if (!p.activo) { if (descartes) descartes.apagado++; return false; }
    if (!p.perfil.validado && !config.modoRevision) { if (descartes) descartes.sinValidar++; return false; }
    return true;
  }

  function esBorrador(p) {
    return !p.activo || !p.perfil.validado;
  }

  function recomendar(productos, respuestas, config, opciones) {
    const r = respuestas || {};
    const o = opciones || {};
    const max = o.cuantos || 3;
    const descartes = { sinPerfil: 0, apagado: 0, agotado: 0, sinValidar: 0, luz: 0 };

    // El agotado cuenta antes que el apagado: es el motivo que importa.
    const base = productos.filter((p) => disponible(p, config, o.borradores, descartes));

    const luzConocida = r.luz && r.luz !== NO_SABE;
    let candidatos = luzConocida ? base.filter((p) => (p.perfil.luz || []).includes(r.luz)) : base;
    descartes.luz = base.length - candidatos.length;

    let luzAlternativa = null;
    if (luzConocida && !candidatos.length) {
      const otra = (config.luzAlternativa || {})[r.luz];
      if (otra) {
        candidatos = base.filter((p) => (p.perfil.luz || []).includes(otra));
        if (candidatos.length) luzAlternativa = otra;
      }
    }

    if (!candidatos.length) {
      return {
        estado: 'sin-compatibles', resultados: [], luzAlternativa: null, coleccion: null, descartes, revision: false,
      };
    }

    // Con la luz alternativa, la razón de luz tiene que ser la de esa luz.
    const rPuntuar = luzAlternativa ? Object.assign({}, r, { luz: luzAlternativa }) : r;
    const puntuados = candidatos.map((producto) =>
      Object.assign({ producto }, puntuar(producto, rPuntuar, config)));

    const rango = rangoDe(config, r.presupuesto);
    let elegidos;
    if (!rango) {
      elegidos = elegirDiversos(puntuados.sort(ordenar), max, [], config);
    } else {
      const dentro = puntuados.filter((c) => c.enPresupuesto).sort(ordenar);
      const fuera = puntuados.filter((c) => !c.enPresupuesto)
        .sort((a, b) => (a.distancia - b.distancia) || ordenar(a, b));
      elegidos = elegirDiversos(dentro, max, [], config);
      if (elegidos.length < max) {
        // Las alternativas por precio van por cercanía, no por puntos: a quien
        // pidió hasta $20 le importa más lo barato que lo bonito.
        fuera.slice(0, max - elegidos.length).forEach((c) => {
          c.alternativa = true;
          elegidos.push(c);
        });
      }
    }

    const condicion = luzAlternativa ? plantilla((config.razones || {}).condicionLuz, {
      alternativa: textoOpcion(config, 'luz', luzAlternativa).toLowerCase(),
    }) : null;

    elegidos.forEach((c) => {
      c.alternativa = !!c.alternativa;
      c.borrador = esBorrador(c.producto);
      if (condicion) c.condicionLuz = condicion;
    });

    const coleccion = elegirColeccion(o.colecciones || [], rPuntuar, config, o.borradores);
    if (coleccion && condicion) coleccion.condicionLuz = condicion;

    let estado;
    const dentroCuenta = elegidos.filter((c) => !c.alternativa).length;
    if (luzAlternativa) estado = 'luz-alternativa';
    else if (rango && dentroCuenta === 0) estado = 'fuera-presupuesto';
    else if (dentroCuenta < elegidos.length) estado = 'parcial';
    else if (elegidos.length < max) estado = 'pocos';
    else estado = 'exacto';

    return {
      estado,
      resultados: elegidos,
      luzAlternativa,
      coleccion,
      descartes,
      revision: elegidos.concat(coleccion || []).some((c) => !c.producto.perfil.validado),
    };
  }

  /* La colección que se ofrece debajo de los tres, o ninguna.

     Pasa el mismo filtro de luz que los productos (con la luz alternativa, si
     la hubo). Por precio, entra si cabe en el presupuesto o si la persona
     eligió uno de config.ajustesColecciones.presupuestosAbiertos: a quien dijo
     «hasta $20» no se le enseña un set de $99. Y necesita un mínimo de puntos,
     para no colgarle una colección a quien no le pega. */
  function elegirColeccion(colecciones, r, config, borradores) {
    const ajustes = config.ajustesColecciones || {};
    const abiertos = ajustes.presupuestosAbiertos || [];
    const minimo = ajustes.puntosMinimos || 0;
    const luzConocida = r.luz && r.luz !== NO_SABE;
    const rango = rangoDe(config, r.presupuesto);

    const opciones = colecciones
      .filter((c) => disponible(c, config, borradores))
      .filter((c) => !luzConocida || (c.perfil.luz || []).includes(r.luz))
      .map((c) => Object.assign({ producto: c }, puntuar(c, r, config)))
      .filter((c) => !rango || c.enPresupuesto || abiertos.includes(r.presupuesto))
      .filter((c) => c.puntos >= minimo)
      .sort(ordenar);

    const elegida = opciones[0];
    if (!elegida) return null;
    elegida.alternativa = !elegida.enPresupuesto;
    elegida.borrador = esBorrador(elegida.producto);
    return elegida;
  }

  /* --- WhatsApp --------------------------------------------------------- */

  function nombreCorto(p) {
    return String(p.item.nombre || p.id).replace(/^Bonsái\s+(de(l)?\s+)?/i, '');
  }

  /* «el Guayacán», «la Colección Cítricos», «el Set Consultorio». */
  function conArticulo(p) {
    const articulo = p.tipo === 'coleccion' ? (p.item.articulo || 'la') : 'el';
    return `${articulo} ${nombreCorto(p)}`;
  }

  /* Lo que la persona contestó, en una línea legible para quien atiende el
     chat. Solo lo que ayuda a recomendar: nada de datos personales. */
  function resumenRespuestas(config, respuestas) {
    const r = respuestas || {};
    const partes = [];
    const t = (id) => textoOpcion(config, id, r[id]);
    if (r.para) partes.push(t('para') + (r.ocasion ? ` (${t('ocasion').toLowerCase()})` : ''));
    if (r.lugar) partes.push(`lugar: ${t('lugar').toLowerCase()}`);
    if (r.luz) partes.push(`luz: ${t('luz').toLowerCase()}`);
    if (r.cuidado) partes.push(`tiempo: ${t('cuidado').toLowerCase()}`);
    if (r.estilo) partes.push(`estilo: ${t('estilo').toLowerCase()}`);
    if (r.tamano) partes.push(`tamaño: ${t('tamano').toLowerCase()}`);
    if (r.presupuesto) partes.push(`presupuesto: ${t('presupuesto').replace(/\s+/g, ' ').toLowerCase()}`);
    return partes.join(' · ');
  }

  function listaNatural(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
  }

  /* El mensaje que llega escrito a WhatsApp. Pregunta por la disponibilidad y
     el envío en vez de darlos por hechos: eso se confirma en el chat. No pide
     «precio actualizado»: el precio ya se le enseñó, y ponerlo en duda invita
     a regatear. Sin seleccionado, es el mensaje de «ver los 3». */
  function mensajeWhatsApp(config, resultado, respuestas, seleccionado) {
    const nombres = resultado.resultados.map((c) => nombreCorto(c.producto));
    const resumen = resumenRespuestas(config, respuestas);
    const lineas = [];

    if (!nombres.length) {
      lineas.push('Hola, DecoGarden. Hice el test de bonsáis y no encontré uno para mi espacio. ¿Me ayudan a buscar una opción?');
    } else if (seleccionado) {
      const elegido = nombreCorto(seleccionado);
      const otros = nombres.filter((n) => n !== elegido);
      lineas.push(`Hola, DecoGarden. Hice el test de bonsáis y me interesa ${conArticulo(seleccionado)}.`);
      if (otros.length) lineas.push(`También me recomendaron: ${listaNatural(otros)}.`);
      lineas.push('¿Está disponible y cuánto sale el envío a mi ciudad?');
    } else {
      lineas.push(`Hola, DecoGarden. Hice el test de bonsáis y me recomendaron: ${listaNatural(nombres)}.`);
      lineas.push('¿Están disponibles y cuánto sale el envío a mi ciudad? ¿Me ayudan a elegir?');
    }
    if (resumen) lineas.push('', `Mis respuestas: ${resumen}.`);
    return lineas.join('\n');
  }

  function enlaceWhatsApp(numero, texto) {
    const limpio = String(numero || '').replace(/\D/g, '');
    return `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
  }

  const DGMotor = {
    precioNumero,
    alturaCm,
    tamanoDe,
    prepararProductos,
    prepararColecciones,
    preguntasVisibles,
    respuestasEfectivas,
    textoOpcion,
    recomendar,
    nombreCorto,
    resumenRespuestas,
    mensajeWhatsApp,
    enlaceWhatsApp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DGMotor;
  else raiz.DGMotor = DGMotor;
})(typeof window !== 'undefined' ? window : globalThis);
