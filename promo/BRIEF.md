# Anuncio de TICO — brief creativo

El vídeo `tico-anuncio.mp4` (35 s, 1920×1080, 60 fps) se genera con código a partir de
este brief: usa el Tico real de la app y la isla real, así el anuncio nunca se queda
desfasado respecto al producto.

```bash
npm run dev          # en otra terminal
npm run promo        # música + render fotograma a fotograma → promo/tico-anuncio.mp4
```

Para ver o retocar una escena en el navegador: <http://localhost:1420/promo.html?t=12>
(salta al segundo 12).

## El prompt, mejorado

> **Objetivo:** que en 35 segundos cualquiera entienda qué es Tico, quiera probarlo y
> sepa dónde descargarlo.
>
> **Idea central:** "Tu pantalla. Ahora con alguien dentro." Tico no es otra ventana de
> chat: es un personaje que vive en el notch y aparece cuando lo necesitas.
>
> **Tono:** cálido, curioso y premium (estilo keynote de Apple). Fondos oscuros, un único
> color de acento (cian `#3DD6D0`), mucho aire, una idea por plano.
>
> **Edición:** cortes con fundido y desenfoque, cámara con *push-in* suave hacia la isla,
> tipografía cinética grande (Inter Display), rótulos en cristal esmerilado, atajos de
> teclado en teclas 3D, efectos de sonido sincronizados con cada acción y música original
> a 100 BPM que entra con el escritorio y culmina con un golpe en el logo.

| Tiempo | Escena | Qué se ve | Sonido |
| ------ | ------ | --------- | ------ |
| 0–3 s | **Gancho** | Negro. "Tu pantalla." / "Ahora con *alguien* dentro." Dos ojos cian se encienden dentro de un notch. | Pad suave, *whooshes*, *blip* de los ojos |
| 3–8 s | **Revelación** | Escritorio de Mac con una hoja de ventas. El cursor va al notch: la isla nace de él, Tico asoma y saluda. Rótulo: "Pasa el ratón por el notch." | Golpe + entra la batería, *pop* de la isla |
| 8–15 s | **Chat** | La cámara se acerca. Se teclea "¿Cómo paso este documento a PDF?". Tico piensa (mano en la barbilla), responde en 3 pasos con formato y celebra. Rótulo: "Pregunta lo que quieras." | Tecleo, envío, campanitas al terminar |
| 15–21 s | **Visión** | Teclas ⌘ ⇧ S. Borde cian, Tico con manos de prismáticos y escáner en el visor, miniatura de la captura y respuesta: "El T3 cae un 12 %…". Rótulo: "Mira tu pantalla. Solo cuando tú se lo pides." | Clics de teclas, barrido, campanitas |
| 21–26 s | **Personaje** | Tico enorme cambiando de expresión: Saluda. Curiosea. Piensa. Mira. Se equivoca. Se duerme. Y vuelve. | Golpe, *blips* en cada cambio |
| 26–30 s | **Ventajas** | "Todo lo que necesitas. Nada que no." Claude · OpenAI · Gemini · Ollama / Privacidad primero / Windows y macOS / 3 idiomas. | *Whoosh*, *pops* de las tarjetas, *riser* |
| 30–35 s | **Cierre** | Tico saludando, "TICO", "La isla dinámica con un robot dentro.", botón "Descárgalo gratis · Windows y macOS". | Golpe final, campanitas, fundido |

## Versión para herramientas de vídeo con IA (Sora, Veo, Runway…)

Si algún día quieres una versión con imagen real (personas, oficina), este es el prompt:

> Anuncio de 35 segundos, estilo keynote de Apple, 4K, iluminación suave y cinematográfica.
> Plano 1: pantalla de un MacBook en una habitación oscura; dentro del notch se encienden
> dos ojos cian en forma de píldora. Texto: "Tu pantalla. Ahora con alguien dentro."
> Plano 2: primer plano del MacBook; del notch nace una cápsula negra y asoma un pequeño
> robot blanco hueso con visor oscuro, ojos LED cian, antena con una bolita brillante y
> brazos cortos; saluda con la mano. Plano 3: una estudiante le pregunta cómo exportar un
> documento a PDF; el robot se lleva la mano a la barbilla, piensa y responde con tres
> pasos numerados dentro de la cápsula; celebra con los brazos en alto. Plano 4: el robot
> pone las manos como prismáticos, una línea de escaneo recorre su visor y comenta una
> gráfica de ventas en pantalla. Plano 5: montaje rápido de sus expresiones (curioso,
> pensativo, dormido, contento) sobre fondo oscuro con brillo cian. Cierre: logotipo
> "TICO" en blanco, lema "La isla dinámica con un robot dentro", botón cian "Descárgalo
> gratis". Movimientos de cámara lentos y suaves, transiciones con desenfoque, música
> electrónica cálida a 100 BPM. Sin logotipos de otras marcas.
