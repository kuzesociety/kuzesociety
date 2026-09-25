# FrigoSIMU

Simulador de instalaciones frigoríficas con su esquema eléctrico, al estilo
**CADe SIMU**: mientras el esquema eléctrico funciona, un circuito frigorífico
animado muestra lo que pasa en cada línea (presiones, temperaturas,
recalentamiento, subenfriamiento, escarcha, flujo de refrigerante…).

Todo se puede tocar: el termostato, la puerta, el refrigerante, la temperatura
exterior, cualquier pieza del circuito o del esquema. Antes de que pase, te
dice **qué va a pasar**; y al revés, con las presiones de una máquina real te
dice **qué avería puede tener** y dónde buscar la fuga.

## Cómo abrirlo

- **Sin instalar nada:** abre `dist/FrigoSIMU.html` con doble clic. Es un único
  archivo que funciona sin conexión.
- **Para desarrollar:** sirve la carpeta con cualquier servidor estático
  (los módulos ES no cargan desde `file://`):

  ```sh
  npx http-server -c-1 .     # y abre http://localhost:8080
  ```

## Los cuatro modos

### Simulador

La instalación arranca sola (se pulsa la marcha automáticamente) y funciona
como una real: el termostato para y arranca el compresor, hay desescarches,
el presostato de baja recoge el gas…

- **Barra de mando:** pausa, velocidad (×1 a ×600), adelantar 10 min o 1 h,
  marcha/paro, consigna de la cámara, puerta, desescarche, temperatura
  exterior y refrigerante.
- **Lecturas** (como un analizador digital): baja y alta con su temperatura de
  saturación, salida del evaporador, recalentamiento, subenfriamiento, saltos
  térmicos, intensidad, descarga, COP, carga, visor… En verde lo normal y en
  rojo lo alto o bajo. La casilla **Estado** diagnostica en vivo (funciona bien,
  enfriando, parado por el termostato, desescarche, ciclos cortos por baja,
  falta de refrigerante…); tócala para ver por qué.
- **Toca cualquier pieza** del circuito frigorífico (cámara, evaporador, VET o
  capilar, tuberías, compresor, condensador, recipiente, visor, filtro,
  solenoide, presostatos, manómetros, refrigerante) y se abre una tarjeta con
  qué hace, sus valores en vivo, sus ajustes y sus averías. Se resaltan en el
  esquema eléctrico los componentes que la mandan.
- **Toca cualquier componente del esquema** (termostato, presostato, bobina,
  motor, reloj…) y te explica **por qué** está así: «M1 no funciona porque la
  bobina KM1 no tiene tensión, porque TH1 está satisfecho: la cámara ha bajado
  a 2,0 °C; vuelve a pedir frío a 4,0 °C». Los pulsadores, interruptores,
  protecciones y la puerta se accionan directamente.
- **Qué va a pasar:** cada cambio (consigna, puerta, refrigerante, exterior,
  averías…) calcula el punto de funcionamiento antes y después y lo enseña con
  flechas en las lecturas: «Termostato a 14 °C → BAJA 3,66 → 5,28 bar ·
  evapora −7,6 → 1,5 °C…». Avisa si el cambio hará saltar un presostato.
- **Lo que está pasando** y un **registro** con las explicaciones en lenguaje
  de frigorista; las gráficas marcan cada cambio que haces.

### Diagnosticar

Para una máquina real: eliges el refrigerante (19 refrigerantes, con las
mezclas zeotrópicas en rocío y burbuja) y escribes lo que marcan manómetros y
termómetros. Te da las temperaturas de saturación, recalentamiento,
subenfriamiento y saltos térmicos, clasifica cada lectura y ordena las averías
probables con el porqué, qué comprobar y cómo repararlo. Si apunta a una
**fuga**, dice dónde buscarla, cómo y qué hacer antes de recargar (con las
t CO₂ eq y la periodicidad del control de fugas). Sugiere **qué medir ahora**
para distinguir entre las más probables y dibuja tu ciclo en el diagrama P-h.
Con *Ver esta avería en el simulador* la reproduce para verla funcionar.

### Practicar

Averías misteriosas: te prepara una cámara en marcha con una avería escondida
y tienes que adivinarla mirando lecturas y dibujo (con pistas y marcador).
Al acertar te enseña qué lecturas lo delataban y te lleva a la pieza averiada
para repararla y ver cómo se recupera.

### Editar esquema

El editor tipo CADe SIMU. Elige un componente en la paleta y colócalo. Con `W`
dibujas cables (un clic en cada esquina; termina sobre un borne o un cable).
`R` gira, `Supr` borra, `Ctrl+Z` deshace, `Ctrl+D` duplica, la rueda o el
pellizco hacen zoom. A cada carga se le asigna su **función frigorífica**
(compresor, ventilador del evaporador o del condensador, resistencia de
desescarche, solenoide o luz); los termostatos, presostatos y finales de
carrera de puerta leen el circuito frigorífico. En *Instalación frigorífica*
se elige refrigerante, potencia, expansión y averías de partida, o se quita el
circuito frigorífico para simular solo el esquema eléctrico.

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

Se abren directamente con `#positiva`, `#congelados`, `#armario` o `#motor` al
final de la dirección, y los modos con `#diagnosticar`, `#practicar` o `#editar`.

## Averías que se pueden provocar

Falta o exceso de refrigerante, **fuga** (lenta, media o rápida: la carga va
bajando), condensador sucio, filtro obstruido, VET bloqueada (cerrada o
abierta), ventiladores averiados, compresor con válvulas rotas o agarrotado,
solenoide que no abre o no cierra, burlete de la puerta dañado e
incondensables. En el esquema eléctrico: quita un fusible (falta de fase),
provoca un cortocircuito (dispara la protección de menor calibre) o deja que
salte el relé térmico.

## Qué simula (y qué no)

Es un simulador **didáctico**. El esquema eléctrico se resuelve de forma lógica
como en CADe SIMU (redes, contactos, bobinas, temporizadores, cortocircuitos,
fases). El circuito frigorífico es un modelo dinámico de parámetros concentrados:

- Propiedades reales de 19 refrigerantes (R404A, R449A, R448A, R452A, R507A,
  R134a, R513A, R1234yf, R1234ze, R22, R407C, R407F, R410A, R32, R454B, R290,
  R600a, R717 y R744) calculadas con CoolProp (`tools/gen_refrigerants.py`).
  En las mezclas, la baja se lee en el punto de rocío y la alta en el de
  burbuja, como en los manómetros digitales. El R744 solo está en Diagnosticar.
- Compresor volumétrico (rendimiento volumétrico, trabajo de compresión,
  temperatura de descarga, intensidad). Al cambiar de refrigerante la máquina
  se recalcula para dar la misma potencia.
- Evaporador con ventilador, escarcha y resistencia de desescarche; condensador
  con ventilador; recipiente de líquido; VET que regula el recalentamiento o
  tubo capilar.
- Inventario de refrigerante entre alta y baja (recogida de gas, falta de
  carga, fugas, migración al evaporador en la parada).
- Cámara con aire y género, pérdidas por paredes y por la puerta.

Los valores son del orden correcto, pero no sustituyen a unas tablas
termodinámicas ni al software de un fabricante.

## Código

Todo es JavaScript sin dependencias.

```
index.html, css/app.css      interfaz
js/main.js                   aplicación: modos, bucle, previsión, diagnóstico en vivo
js/elec/components.js        biblioteca de componentes y símbolos IEC
js/elec/solver.js            simulación eléctrica
js/elec/explain.js           «por qué» funciona o no cada carga del esquema
js/elec/editor.js            editor del esquema (SVG)
js/elec/builder.js           construir esquemas desde código (ejemplos)
js/refrig/refdata.js         tablas de los refrigerantes (generadas con CoolProp)
js/refrig/refrigerants.js    propiedades de los refrigerantes
js/refrig/model.js           modelo del circuito frigorífico (y previsión)
js/refrig/view.js            dibujo animado del circuito frigorífico
js/link.js                   acoplamiento eléctrico ↔ frigorífico
js/narrator.js               explicaciones de lo que pasa
js/diagnose.js               diagnóstico a partir de lecturas
js/ui/                       lecturas, tarjetas, paneles, gráficas, diagnóstico y práctica
js/examples.js               esquemas de ejemplo
tools/gen_refrigerants.py    regenera js/refrig/refdata.js
build.mjs                    genera dist/FrigoSIMU.html
test/                        pruebas (node --test)
```

```sh
npm test         # pruebas del modelo, del motor eléctrico, de los ejemplos y del diagnóstico
npm run build    # regenera dist/FrigoSIMU.html
```

Los esquemas se guardan como `.json` (*Guardar* / *Abrir*) y el último esquema
se recuerda en el navegador.
