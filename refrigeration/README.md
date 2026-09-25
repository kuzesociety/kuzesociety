# FrigoSIMU

Simulador de esquemas eléctricos al estilo **CADe SIMU** al que le puedes decir
*«esto es un circuito frigorífico»*: mientras el esquema eléctrico funciona, un
circuito frigorífico animado muestra lo que pasa en cada línea (presiones,
temperaturas, recalentamiento, subenfriamiento, escarcha, flujo de refrigerante…).

Ejemplo: al abrir la puerta de la cámara, el final de carrera `SQ1` para el
ventilador del evaporador y enciende la luz. En el circuito frigorífico el
evaporador deja de recibir aire, la presión de baja cae y la batería empieza a
escarcharse. En el registro queda la explicación y, un minuto y medio después,
cuánto han cambiado la baja, la alta y la temperatura de la cámara.

## Cómo abrirlo

- **Sin instalar nada:** abre `dist/FrigoSIMU.html` con doble clic. Es un único
  archivo que funciona sin conexión.
- **Para desarrollar:** sirve la carpeta con cualquier servidor estático
  (los módulos ES no cargan desde `file://`):

  ```sh
  npx http-server -c-1 .     # y abre http://localhost:8080
  ```

## Cómo se usa

1. **Editar.** Elige un componente en la paleta de la izquierda y colócalo.
   Con `W` dibujas cables (un clic en cada esquina; termina sobre un borne o un
   cable). `R` gira, `Supr` borra, `Ctrl+Z` deshace, `Ctrl+D` duplica, la rueda
   o el pellizco hacen zoom.
2. **Decirle que es un circuito frigorífico.** Activa el botón
   *Circuito frigorífico* y asigna a cada carga su **función frigorífica** en
   *Propiedades*: compresor, ventilador del evaporador, ventilador del
   condensador, resistencia de desescarche, válvula solenoide o luz de la
   cámara. La paleta *Frigorífico* ya trae estos componentes preparados.
3. **Sensores.** Los termostatos (sonda de cámara, batería, género o exterior),
   los presostatos de alta y de baja y los finales de carrera de la puerta leen
   el circuito frigorífico y mueven sus contactos.
4. **Simular.** Pulsa *Simular*. Haz clic en pulsadores, interruptores,
   magnetotérmicos, fusibles, relés térmicos, presostatos (rearme), el reloj de
   desescarche o la puerta de la cámara. `Espacio` pone en pausa. La velocidad
   va de ×1 a ×300.

En el panel inferior tienes:

| Pestaña | Qué muestra |
| --- | --- |
| Propiedades | Parámetros del componente seleccionado y su estado en vivo. |
| Cámara y averías | Puerta, temperatura exterior, meter género caliente, refrigerante, potencia, tipo de expansión y averías. |
| Gráficas | Alta, baja y temperaturas en el tiempo, con las marchas del compresor, desescarches y aperturas de puerta. |
| Diagrama P-h | El ciclo actual sobre la campana del refrigerante: efecto frigorífico, trabajo de compresión y COP. |
| Diagnóstico | Lecturas con su rango normal (recalentamiento, subenfriamiento, saltos térmicos, descarga, intensidad…) y un diagnóstico probable. |
| Registro | Qué ha pasado y por qué, en lenguaje de frigorista. |

## Ejemplos incluidos

- **Cámara de conservación +2 °C** (R404A, VET): marcha/paro con
  autoenclavamiento, termostato, presostatos de alta y baja, relé térmico,
  final de carrera de puerta (ventilador y luz) y reloj de desescarche por parada.
- **Congelados −20 °C con pump-down**: el termostato manda la solenoide y el
  presostato de baja arranca y para el compresor; desescarche eléctrico con fin
  por termostato y retardo de ventiladores.
- **Armario frigorífico** (R134a, tubo capilar, monofásico): al parar se
  igualan las presiones.
- **Marcha-paro de un motor**: esquema clásico solo eléctrico.

También se puede abrir un ejemplo directamente con `#positiva`, `#congelados`,
`#armario` o `#motor` al final de la dirección.

## Averías que se pueden provocar

Falta o exceso de refrigerante, condensador sucio, filtro obstruido, VET
bloqueada (cerrada o abierta), ventiladores averiados, compresor con válvulas
rotas o agarrotado, solenoide que no abre o no cierra, burlete de la puerta
dañado e incondensables. En el esquema eléctrico: quita un fusible (falta de
fase), provoca un cortocircuito (dispara la protección de menor calibre) o deja
que salte el relé térmico.

## Qué simula (y qué no)

Es un simulador **didáctico**. El esquema eléctrico se resuelve de forma lógica
como en CADe SIMU (redes, contactos, bobinas, temporizadores, cortocircuitos,
fases). El circuito frigorífico es un modelo dinámico de parámetros concentrados:

- Presiones de saturación reales de R404A, R134a, R22, R290, R410A, R32 y R600a.
- Compresor volumétrico (rendimiento volumétrico, trabajo de compresión,
  temperatura de descarga, intensidad).
- Evaporador con ventilador, escarcha y resistencia de desescarche; condensador
  con ventilador; recipiente de líquido; VET que regula el recalentamiento o
  tubo capilar.
- Inventario de refrigerante entre alta y baja (recogida de gas, falta de carga,
  migración al evaporador en la parada).
- Cámara con aire y género, pérdidas por paredes y por la puerta.

Los valores son del orden correcto, pero no sustituyen a unas tablas
termodinámicas ni al software de un fabricante.

## Código

Todo es JavaScript sin dependencias.

```
index.html, css/app.css      interfaz
js/main.js                   aplicación (bucle, barra de herramientas, paneles)
js/elec/components.js        biblioteca de componentes y símbolos IEC
js/elec/solver.js            simulación eléctrica
js/elec/editor.js            editor del esquema (SVG)
js/elec/builder.js           construir esquemas desde código (ejemplos)
js/refrig/refrigerants.js    propiedades de los refrigerantes
js/refrig/model.js           modelo del circuito frigorífico
js/refrig/view.js            dibujo animado del circuito frigorífico
js/link.js                   acoplamiento eléctrico ↔ frigorífico
js/narrator.js               explicaciones y diagnóstico
js/ui/                       gráficas, diagrama P-h y paneles
js/examples.js               esquemas de ejemplo
build.mjs                    genera dist/FrigoSIMU.html
test/                        pruebas (node --test)
```

```sh
npm test         # pruebas del modelo, del motor eléctrico y de los ejemplos
npm run build    # regenera dist/FrigoSIMU.html
```

Los esquemas se guardan como `.json` (*Guardar* / *Abrir*) y el último esquema
se recuerda en el navegador.
