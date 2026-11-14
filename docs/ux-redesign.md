# M3.5 — UX del observatorio

Implementado el 2026-11-13 en `ux-redesign`, desde `milestone3` (`2d70739`).

## Problemas encontrados

Dos bloques explicativos precedían al visor. El encabezado, las tarjetas de
objetivos, controles, espectros y metadatos competían por atención. Algunas
explicaciones sugerían descubrimientos, catálogos en vivo o movimiento medido.
La primera época en Diferencia podía restarse de sí misma; los controles de
intensidad y el mínimo de ±25 de la diferencia no estaban adaptados a M101.
La exportación GIF no conservaba la máscara y su texto tapaba los píxeles.

## Cambios

- Encabezado con propósito, origen persistente, selector de origen y menú secundario.
- Visor central con las fechas UTC del conjunto recibido; controles de parpadeo,
  anterior/siguiente, fechas y Normal/Diferencia inmediatamente debajo.
- M101 real por defecto sin configuración explícita. `api=real` y `api=mock`
  prevalecen sobre `NEXT_PUBLIC_USE_REAL_API`; `false` conserva un despliegue
  que abre simulación. Cambiar origen recarga con valores compatibles.
- La selección manual pausa la animación. Entrar en Diferencia selecciona la
  segunda época si estaba activa la primera. El selector muestra la referencia;
  la explicación indica el orden de resta. La escala es simétrica respecto a cero
  y depende del intervalo de intensidad, sin el mínimo sintético de ±25.
- Referencia mediana corregida para calcular mediana, no promedio.
- Texto contextual específico por modo, límites científicos visibles y guía
  descartable de tres pasos, recuperable desde Más opciones.
- Colores oscuros y cian; origen sintético identificado en ámbar. Sin dependencias nuevas.
- Foco visible, botones con estado seleccionado, inspección de píxel por teclado,
  diálogos con foco contenido y cierre Escape. Los atajos respetan campos y botones.
- Escala y dimensiones de metadatos derivadas del WCS y los frames. PNG y GIF
  conservan el color de máscara; GIF sin texto superpuesto sobre datos.

## Funciones secundarias y ocultas

Herramientas avanzadas contiene intensidad, estiramiento, paleta, apilado,
referencia de diferencia, retícula, velocidad, reproducción secuencial de todas
las fechas, metadatos, procedencia completa y WCS. Exportación e
inspección de píxel tienen su propio desplegable bajo los controles, para
conservar el estado y zoom de la misma instancia del visor.

Compartir, insertar, audio, ayuda, portada y recuperación de guía están en el menú.
La búsqueda y los objetivos educativos permanecen disponibles en simulación.
El espectro sintético, detective y rastros están en herramientas secundarias.

En real no se ofrecen espectros de 102 bandas, detective, catálogos Gaia/CatWISE,
trayectorias sintéticas, cambios de campo ni selectores de detectores sin
alternativas. Se bloquean también las vías por URL/atajos para activar detective
y catálogos. La máscara científica se aplica siempre; no se añadió un control
que permita mostrar píxeles inválidos como medidas. Aladin es un enlace externo,
no un mapa de detecciones SPHEREx.

No se modificó el servicio ni el pipeline M1/M2, ni el esquema HTTP.

## Verificación

- `cd frontend && npm run lint`: sin errores; advertencia preexistente de fuente
  en `app/layout.tsx`.
- `cd frontend && npm run build`: build de producción y tipos correctos.
- `cd server && uv run --locked pytest -q`: 47 pruebas pasan; una advertencia
  de deprecación de Starlette sobre httpx.
- `cd server && uv run --locked python scripts/test_ux_browser.py`: Chromium
  real mediante CDP, con Next.js :3000 y FastAPI :8000 y caché auténtica M101.
  Comprueba dimensiones 30×30/256×256, origen, alternancia y pausa, entrada en
  Diferencia, avanzado, descargas PNG/GIF, atajo D, ayuda/Escape, error de región
  no soportada e inserción sintética. Comprueba ausencia de desbordamiento a
  1440×900 y 390×844. No usa imágenes sintéticas para la prueba del modo real.
- Capturas completas: `assets/ux-real-desktop.png`, `assets/ux-real-mobile.png`,
  `assets/ux-mock-desktop.png`, `assets/ux-mock-mobile.png`.

La ejecución final se realizó sobre `npm run start` después del build; no hubo
excepciones JavaScript ni mensajes console.error en los recorridos normales real
y sintético. También se corrigió un desajuste de hidratación del origen `api=mock`
mediante un snapshot estable durante la hidratación.

El conector Playwright no encontró Chrome; se utilizó el Chromium instalado que
ya empleaba la verificación M3. Hubo que reiniciar Next.js después de ejecutar el
build simultáneamente con dev. Un cierre del backend permitió observar también
el error de conexión explícito sin sustitución sintética. Las pruebas completas
se ejecutaron posteriormente con ambos servicios disponibles.

## Límites pendientes

No se realizó estudio con visitantes ni evaluación formal con lector de pantalla;
el objetivo de comprensión en 60 segundos requiere prueba con personas. En móvil
se necesita desplazar la página para acceder a los controles bajo la imagen.
El desplazamiento de imagen conserva Shift/ratón; el zoom y la inspección de
coordenadas ofrecen botones y campos para teclado. Las páginas educativas heredadas
siguen siendo simulaciones y conservan su diseño anterior. No se validaron
catálogos externos, fotometría de precisión ni detección de movimiento. No se
recalibraron WCS, bandas, fondos ni PSF.
