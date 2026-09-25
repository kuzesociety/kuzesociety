// Vista animada del circuito frigorífico (SVG).

import { getRefrigerant, psat, psatDew, psatBubble, gauge } from './refrigerants.js';

const NS = 'http://www.w3.org/2000/svg';

// Recorridos de las tuberías (coordenadas del viewBox 1000×640).
const PATH = {
  discharge: 'M580,420 V100 H612',
  condenser: 'M612,100 H940 V120 H626 V140 H940 V160 H626 V180 H948',
  condOut: 'M948,180 V250',
  liquid: 'M948,420 V580 H392 V222',
  mix: 'M392,198 V188 H362',
  evap: 'M362,188 H160 V168 H354 V148 H160 V128 H362',
  suction: 'M362,128 H505 V480 H538',
};

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

function niceCeil(v) {
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 60];
  return steps.find((s) => s >= v) || Math.ceil(v / 10) * 10;
}

export class FridgeView {
  constructor(svg, { onDoor, onPart } = {}) {
    this.svg = svg;
    this.onDoor = onDoor;
    this.onPart = onPart;
    this.offsets = {};
    this.doorAngle = 0;
    this.refId = null;
    this.svg.setAttribute('viewBox', '0 0 1000 640');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
    this.svg.innerHTML = this.template();
    this.$ = (id) => this.svg.querySelector(`#fv-${id}`);
    this.flows = {};
    for (const k of Object.keys(PATH)) this.flows[k] = this.$(`flow-${k}`);
    this.$('door').addEventListener('click', (e) => {
      e.stopPropagation();
      this.onDoor && this.onDoor();
    });
    this.svg.addEventListener('click', (e) => {
      const el = e.target.closest('[data-part]');
      if (el && this.onPart) this.onPart(el.dataset.part, e);
    });
    this.svg.addEventListener('keydown', (e) => {
      const el = e.target.closest && e.target.closest('[data-part]');
      if (el && (e.key === 'Enter' || e.key === ' ') && this.onPart) {
        e.preventDefault();
        this.onPart(el.dataset.part, e);
      }
    });
    this.$('door').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onDoor && this.onDoor();
      }
    });
  }

  template() {
    const pipe = (k, cls, part) =>
      `<g data-part="${part}" class="part-g"><path class="pipe-hit" d="${PATH[k]}"/><path class="pipe-shell" d="${PATH[k]}"/><path id="fv-pipe-${k}" class="pipe ${cls}" d="${PATH[k]}"/><path id="fv-flow-${k}" class="flow" d="${PATH[k]}"/></g>`;
    const fins = [];
    for (let x = 164; x <= 356; x += 6) fins.push(`<line x1="${x}" y1="116" x2="${x}" y2="200"/>`);
    const cfins = [];
    for (let x = 616; x <= 948; x += 6) cfins.push(`<line x1="${x}" y1="90" x2="${x}" y2="198"/>`);
    const blades = (cx, cy, r) =>
      [0, 120, 240]
        .map((a) => `<ellipse cx="${cx}" cy="${cy - r * 0.5}" rx="${r * 0.22}" ry="${r * 0.48}" transform="rotate(${a} ${cx} ${cy})"/>`)
        .join('');
    const tag = (id, x, y, w, part, anchor = 'start') =>
      `<g id="fv-${id}" class="ftag" data-part="${part}" transform="translate(${x},${y})"><rect x="${anchor === 'end' ? -w : 0}" y="-11" width="${w}" height="22" rx="4"/><text x="${anchor === 'end' ? -w + 7 : 7}" y="1" dominant-baseline="middle"></text></g>`;
    return `
<defs>
  <linearGradient id="fv-g-evap" gradientUnits="userSpaceOnUse" x1="0" y1="190" x2="0" y2="126">
    <stop id="fv-g-evap-a" offset="0.6" class="st-lpm"/><stop id="fv-g-evap-b" offset="0.6" class="st-lpg"/>
  </linearGradient>
  <linearGradient id="fv-g-cond" gradientUnits="userSpaceOnUse" x1="0" y1="96" x2="0" y2="184">
    <stop id="fv-g-cond-a" offset="0.72" class="st-hpg"/><stop id="fv-g-cond-b" offset="0.72" class="st-hpl"/>
  </linearGradient>
  <pattern id="fv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch"/></pattern>
</defs>

<!-- zonas -->
<g data-part="room" class="part-g" tabindex="0" role="button" aria-label="Cámara: temperatura y termostato">
<rect class="zone-room" x="70" y="56" width="350" height="566" rx="8"/>
<text class="zone-t" x="86" y="80">CÁMARA</text>
<text id="fv-troom" class="big" x="245" y="330" text-anchor="middle">—</text>
<text class="fl" x="245" y="352" text-anchor="middle">aire de la cámara</text>
<text id="fv-roominfo" class="fl2" x="245" y="374" text-anchor="middle"></text>
<g class="boxes">
  <rect x="96" y="520" width="58" height="46" rx="3"/><rect x="160" y="520" width="58" height="46" rx="3"/>
  <rect x="126" y="474" width="58" height="46" rx="3"/><rect x="230" y="534" width="44" height="32" rx="3"/>
  <line x1="96" y1="543" x2="154" y2="543"/><line x1="160" y1="543" x2="218" y2="543"/><line x1="126" y1="497" x2="184" y2="497"/>
</g>
<text id="fv-tprod" class="fl2" x="185" y="462" text-anchor="middle"></text>
<line class="floor" x1="84" y1="566" x2="300" y2="566"/>
</g>
<g data-part="unit" class="part-g" tabindex="0" role="button" aria-label="Unidad exterior: temperatura exterior">
<rect class="zone-unit" x="450" y="56" width="534" height="566" rx="8"/>
<text class="zone-t" x="466" y="80">UNIDAD CONDENSADORA · EXTERIOR</text>
<text id="fv-tamb" class="zone-v" x="968" y="80" text-anchor="end"></text>
</g>
<g data-part="refrigerant" class="refchip" tabindex="0" role="button" aria-label="Cambiar el refrigerante">
<rect id="fv-ref-bg" x="330" y="66" width="80" height="22" rx="11"/>
<text id="fv-ref" x="370" y="78" text-anchor="middle" dominant-baseline="middle">R404A</text>
</g>

<!-- puerta -->
<g id="fv-door-air" class="door-air">
  <path d="M8,488 C40,488 60,500 96,500" /><path d="M8,516 C40,516 60,522 104,522" /><path d="M96,548 C60,548 40,548 8,548" class="cold"/>
</g>
<line class="door-gap" x1="70" y1="470" x2="70" y2="570"/>
<g id="fv-door" class="door" role="button" tabindex="0" aria-label="Abrir o cerrar la puerta de la cámara">
  <rect class="door-hit" x="44" y="464" width="52" height="112"/>
  <g id="fv-door-leaf"><rect x="66" y="470" width="8" height="100" rx="2"/><circle cx="74" cy="520" r="2.4" class="knob"/></g>
</g>
<text id="fv-door-t" class="fl2" x="84" y="592">puerta cerrada</text>

<!-- evaporador -->
<g data-part="evap" class="part-g" tabindex="0" role="button" aria-label="Evaporador">
<rect class="housing" x="92" y="104" width="282" height="110" rx="10"/>
<circle class="fan-ring" cx="124" cy="159" r="27"/>
<g id="fv-fanE" class="blades" style="transform-origin:124px 159px">${blades(124, 159, 24)}</g>
<circle class="hub" cx="124" cy="159" r="4"/>
<g class="fins">${fins.join('')}</g>
<g id="fv-heater" class="heater"><path d="M160,158 l5,-6 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l9,-6"/></g>
<path class="pipe-shell thin" d="${PATH.evap}"/>
<path id="fv-pipe-evap" class="pipe thin" d="${PATH.evap}" stroke="url(#fv-g-evap)"/>
<path id="fv-flow-evap" class="flow thin" d="${PATH.evap}"/>
<rect id="fv-ice" class="ice" x="156" y="112" width="206" height="94" rx="6"/>
<rect id="fv-ice-h" x="156" y="112" width="206" height="94" rx="6" fill="url(#fv-hatch)"/>
<text class="part" x="233" y="98" text-anchor="middle">EVAPORADOR</text>
</g>
<g id="fv-air" class="air">
  <path d="M110,222 C112,262 140,282 176,296"/><path d="M190,222 C194,268 214,292 240,306"/><path d="M290,222 C292,262 300,286 318,302"/>
</g>

<!-- VET -->
${pipe('mix', 'lpm', 'txv')}
<g data-part="txv" class="part-g" tabindex="0" role="button" aria-label="Válvula de expansión">
<rect class="hitbox" x="376" y="116" width="62" height="118"/>
<g class="valve">
  <path d="M382,212 L402,212 L392,203 Z M382,196 L402,196 L392,205 Z" transform="translate(0,4)"/>
  <path d="M402,205 h10" class="thinline"/><rect x="412" y="198" width="10" height="14" rx="2"/>
</g>
<path id="fv-capline" class="capillary" d="M417,198 V150 Q417,136 406,134"/>
<rect id="fv-bulb" class="bulb" x="398" y="122" width="16" height="12" rx="3"/>
<text id="fv-txv-t" class="part" x="426" y="226" text-anchor="start">VET</text>
</g>

<!-- líneas -->
${pipe('suction', 'lpg', 'suction')}
${pipe('liquid', 'hpl', 'liquid')}
${pipe('discharge', 'hpg', 'discharge')}

<!-- condensador -->
<g data-part="cond" class="part-g" tabindex="0" role="button" aria-label="Condensador">
<rect class="housing" x="604" y="84" width="356" height="124" rx="8"/>
<g class="fins">${cfins.join('')}</g>
<path class="pipe-shell thin" d="${PATH.condenser}"/>
<path id="fv-pipe-condenser" class="pipe thin" d="${PATH.condenser}" stroke="url(#fv-g-cond)"/>
<path id="fv-flow-condenser" class="flow thin" d="${PATH.condenser}"/>
<rect id="fv-dirt" class="dirt" x="610" y="88" width="344" height="116" rx="6"/>
<circle class="fan-ring big" cx="782" cy="146" r="52"/>
<g id="fv-fanC" class="blades" style="transform-origin:782px 146px">${blades(782, 146, 48)}</g>
<circle class="hub" cx="782" cy="146" r="6"/>
<text class="part" x="782" y="228" text-anchor="middle">CONDENSADOR</text>
</g>
<g id="fv-hotair" class="air hot">
  <path d="M690,80 C690,66 694,58 700,48"/><path d="M782,80 C782,66 782,58 782,46"/><path d="M874,80 C874,66 870,58 864,48"/>
</g>
${pipe('condOut', 'hpl', 'liquid')}

<!-- recipiente -->
<g data-part="receiver" class="part-g" tabindex="0" role="button" aria-label="Recipiente y carga de refrigerante">
<rect class="receiver" x="928" y="250" width="40" height="170" rx="18"/>
<clipPath id="fv-recv-clip"><rect x="930" y="252" width="36" height="166" rx="16"/></clipPath>
<rect id="fv-recv-liq" class="recv-liq" x="930" y="330" width="36" height="88" clip-path="url(#fv-recv-clip)"/>
<text class="part" x="922" y="440" text-anchor="end">RECIPIENTE</text>
</g>

<!-- filtro, visor, solenoide -->
<g data-part="filter" class="part-g" tabindex="0" role="button" aria-label="Filtro deshidratador">
<rect class="hitbox" x="840" y="550" width="64" height="46"/>
<rect class="filter" x="846" y="570" width="52" height="20" rx="9"/>
<text class="part" x="872" y="562" text-anchor="middle">FILTRO</text>
</g>
<g data-part="glass" class="part-g" tabindex="0" role="button" aria-label="Visor de líquido">
<rect class="hitbox" x="768" y="550" width="44" height="46"/>
<circle class="glass-ring" cx="790" cy="580" r="13"/>
<circle id="fv-glass" class="glass" cx="790" cy="580" r="8.5"/>
<g id="fv-bubbles" class="bubbles"><circle cx="786" cy="577" r="2"/><circle cx="792" cy="583" r="1.6"/><circle cx="794" cy="576" r="1.2"/><circle cx="787" cy="584" r="1.3"/></g>
<text class="part" x="790" y="562" text-anchor="middle">VISOR</text>
</g>
<g id="fv-sol" class="solenoid part-g" data-part="sol" tabindex="0" role="button" aria-label="Válvula solenoide">
  <rect class="hitbox" x="676" y="530" width="48" height="66"/>
  <path class="sol-body" d="M686,570 L686,590 L700,580 Z M714,570 L714,590 L700,580 Z"/>
  <line x1="700" y1="580" x2="700" y2="566" class="thinline"/>
  <rect id="fv-sol-coil" class="sol-coil" x="689" y="546" width="22" height="20" rx="3"/>
  <text class="part" x="700" y="540" text-anchor="middle">SOLENOIDE</text>
</g>

<!-- compresor -->
<g data-part="comp" class="part-g" tabindex="0" role="button" aria-label="Compresor">
<path id="fv-comp" class="compressor" d="M538,520 V452 Q538,420 580,420 Q622,420 622,452 V520 Z"/>
<rect class="comp-base" x="530" y="520" width="100" height="8" rx="2"/>
<circle class="comp-motor" cx="580" cy="474" r="17"/>
<g id="fv-comp-spin" class="comp-spin" style="transform-origin:580px 474px"><path d="M580,457 a17,17 0 0,1 16,11"/><path d="M596,468 l-1,-6 m1,6 l-6,-1"/></g>
<text class="part" x="580" y="546" text-anchor="middle">COMPRESOR</text>
<text id="fv-compinfo" class="fl2" x="580" y="564" text-anchor="middle"></text>
</g>

<!-- presostatos -->
<g id="fv-pb" class="pstat part-g" data-part="pb" tabindex="0" role="button" aria-label="Presostato de baja"><rect x="516" y="330" width="46" height="22" rx="3"/><text x="539" y="342" text-anchor="middle" dominant-baseline="middle">PB</text></g>
<path class="capillary" d="M516,341 H505"/>
<g id="fv-pa" class="pstat part-g" data-part="pa" tabindex="0" role="button" aria-label="Presostato de alta"><rect x="516" y="376" width="46" height="22" rx="3"/><text x="539" y="388" text-anchor="middle" dominant-baseline="middle">PA</text></g>
<path class="capillary" d="M562,387 H580"/>

<!-- manómetros -->
<path class="hose lp" d="M505,300 H598"/>
<path class="hose hp" d="M580,244 H840 V256"/>
<g id="fv-gLP" class="gauge lp part-g" data-part="gLP" tabindex="0" role="button" aria-label="Manómetro de baja" transform="translate(660,318)"></g>
<g id="fv-gHP" class="gauge hp part-g" data-part="gHP" tabindex="0" role="button" aria-label="Manómetro de alta" transform="translate(840,318)"></g>

<!-- etiquetas de medida -->
${tag('t-dis', 590, 226, 120, 'discharge')}
${tag('t-liq', 940, 470, 150, 'liquid', 'end')}
${tag('t-filt', 872, 612, 110, 'filter')}
${tag('t-evin', 250, 256, 130, 'txv')}
${tag('t-evout', 382, 110, 150, 'suction')}
${tag('t-suc', 498, 506, 108, 'suction', 'end')}
${tag('t-coil', 96, 230, 176, 'evap')}

<!-- leyenda -->
<g class="legend" transform="translate(462,606)">
  <line x1="0" y1="0" x2="16" y2="0" class="lg hpg"/><text x="20" y="0">alta · gas</text>
  <line x1="84" y1="0" x2="100" y2="0" class="lg hpl"/><text x="104" y="0">alta · líquido</text>
  <line x1="190" y1="0" x2="206" y2="0" class="lg lpm"/><text x="210" y="0">baja · mezcla</text>
  <line x1="298" y1="0" x2="314" y2="0" class="lg lpg"/><text x="318" y="0">baja · vapor</text>
</g>`;
  }

  /** Dibuja las esferas de los manómetros para el refrigerante actual. */
  buildGauges(refId) {
    this.refId = refId;
    const ref = getRefrigerant(refId);
    const lpMax = niceCeil(gauge(psat(ref, 22)));
    const hpMax = niceCeil(gauge(psat(ref, Math.min(68, ref.Tc - 4))) + 2);
    this.gLP = { min: -1, max: lpMax, el: this.$('gLP') };
    this.gHP = { min: 0, max: hpMax, el: this.$('gHP') };
    for (const [g, name] of [[this.gLP, 'BAJA'], [this.gHP, 'ALTA']]) {
      g.el.innerHTML = gaugeSVG(g, name, ref);
      g.needle = g.el.querySelector('.needle');
      g.val = g.el.querySelector('.g-val');
      g.sat = g.el.querySelector('.g-sat');
    }
  }

  setTag(id, s) {
    const g = this.$(id);
    const t = g.querySelector('text');
    if (t.textContent !== s) {
      t.textContent = s;
      const w = Math.ceil(t.getComputedTextLength ? t.getComputedTextLength() + 14 : s.length * 6.5 + 14);
      const r = g.querySelector('rect');
      const end = Number(r.getAttribute('x')) < 0;
      r.setAttribute('width', w);
      if (end) {
        r.setAttribute('x', -w);
        t.setAttribute('x', -w + 7);
      }
    }
    g.style.display = s ? '' : 'none';
  }

  /**
   * Actualiza la vista. o = salida del modelo, info = datos extra del
   * esquema (termostato de cámara, presostatos...), dt = segundos reales.
   */
  update(o, info, dt) {
    if (!o) return;
    if (o.refrigerant !== this.refId) this.buildGauges(o.refrigerant);
    const running = o.running;
    this.svg.classList.toggle('is-running', running);
    this.svg.classList.toggle('is-locked', !!o.locked);

    // Flujo: velocidad de los trazos proporcional al caudal.
    const flow = Math.min(o.flow, 2);
    const feed = Math.min((o.mFeed || 0) / Math.max(o.mComp || 1e-9, 1e-9), 2);
    const eqFlow = !running && o.mFeed > 1e-5 ? 0.25 : 0;
    const speeds = {
      discharge: 70 * flow,
      condenser: 45 * flow,
      condOut: 22 * flow,
      liquid: 22 * (running ? Math.max(flow * Math.min(feed, 1.3), 0) : eqFlow),
      mix: 30 * (running ? flow : eqFlow),
      evap: 34 * (running ? flow : eqFlow),
      suction: 70 * flow,
    };
    for (const [k, el] of Object.entries(this.flows)) {
      const v = speeds[k] || 0;
      this.offsets[k] = ((this.offsets[k] || 0) - v * dt) % 1600;
      el.style.strokeDashoffset = this.offsets[k];
      el.style.opacity = v > 0.5 ? Math.min(1, 0.35 + v / 60) : 0;
    }

    // Tuberías: más apagadas cuando no hay circulación.
    this.svg.classList.toggle('no-flow', !running);
    this.$('pipe-suction').classList.toggle('frosted', o.floodback || (running && o.Tsuc < -2));
    this.$('pipe-liquid').classList.toggle('flashing', o.flash > 0.05 && running);

    // Gradientes: parte en mezcla del evaporador y zona de líquido del condensador.
    const wet = Math.max(0.05, Math.min(1, o.wet));
    this.$('g-evap-a').setAttribute('offset', wet);
    this.$('g-evap-b').setAttribute('offset', wet);
    const condLiq = running ? 0.78 - Math.min(o.SC, 20) * 0.015 : 0.9;
    this.$('g-cond-a').setAttribute('offset', condLiq);
    this.$('g-cond-b').setAttribute('offset', condLiq);

    // Ventiladores, resistencia, hielo, suciedad.
    this.$('fanE').classList.toggle('on', o.fanE);
    this.$('fanC').classList.toggle('on', o.fanC);
    this.$('air').classList.toggle('on', o.fanE);
    this.$('hotair').classList.toggle('on', o.fanC && running);
    this.$('heater').classList.toggle('on', o.heater);
    this.$('ice').style.opacity = Math.min(0.9, o.iceFrac * 1.1).toFixed(3);
    this.$('ice-h').style.opacity = Math.min(0.8, o.iceFrac).toFixed(3);
    this.$('dirt').style.opacity = ((info && info.condDirt) || 0) * 0.7;

    // Puerta (animada).
    const target = o.door ? 42 : 0;
    this.doorAngle += (target - this.doorAngle) * Math.min(1, dt * 8);
    this.$('door-leaf').setAttribute('transform', `rotate(${this.doorAngle.toFixed(1)} 70 470)`);
    this.$('door-air').classList.toggle('on', o.door);
    this.$('door-t').textContent = o.door ? 'puerta ABIERTA' : 'puerta cerrada';
    this.$('door').classList.toggle('open', o.door);

    // Solenoide y visor.
    const sol = this.$('sol');
    sol.style.display = o.hasSolenoid ? '' : 'none';
    sol.classList.toggle('open', o.solOpen);
    this.$('bubbles').classList.toggle('on', o.flash > 0.05);
    this.$('glass').classList.toggle('empty', o.flash > 0.5);

    // Recipiente.
    const lv = Math.max(0, Math.min(1, o.receiverLevel));
    const h = 166 * lv;
    const rl = this.$('recv-liq');
    rl.setAttribute('y', 418 - h);
    rl.setAttribute('height', h);

    // Compresor.
    const comp = this.$('comp');
    comp.classList.toggle('on', running);
    comp.classList.toggle('locked', !!o.locked);
    this.$('comp-spin').classList.toggle('on', running);
    let ci;
    if (running) ci = `MARCHA · ${fmt(o.current)} A · ${fmt(o.Wel, 2)} kW`;
    else if (o.locked) ci = `¡BLOQUEADO! · ${fmt(o.current)} A`;
    else ci = 'parado';
    this.$('compinfo').textContent = ci;

    // Presostatos.
    if (info) {
      this.$('pa').classList.toggle('trip', !!info.paTrip);
      this.$('pb').classList.toggle('trip', !!info.pbTrip);
      this.$('pa').style.display = info.hasPA ? '' : 'none';
      this.$('pb').style.display = info.hasPB ? '' : 'none';
    }

    // Manómetros (en mezclas: rocío en baja, burbuja en alta).
    this.setGauge(this.gLP, o.PeG, o.Te, o.zeotropic ? ' rocío' : '');
    this.setGauge(this.gHP, o.PcG, o.Tc, o.zeotropic ? ' burb.' : '');
    const refT = this.$('ref');
    if (refT.textContent !== o.refrigerant) {
      refT.textContent = o.refrigerant;
      const w = Math.max(64, (refT.getComputedTextLength ? refT.getComputedTextLength() : o.refrigerant.length * 8) + 26);
      const bg = this.$('ref-bg');
      bg.setAttribute('width', w);
      bg.setAttribute('x', 410 - w);
      refT.setAttribute('x', 410 - w / 2);
    }
    this.$('txv-t').textContent = info && info.capillary ? 'CAPILAR' : 'VET';
    this.$('bulb').style.display = info && info.capillary ? 'none' : '';
    this.$('capline').style.display = info && info.capillary ? 'none' : '';

    // Textos.
    this.$('tamb').textContent = `${fmt(o.Tamb)} °C`;
    this.$('troom').textContent = `${fmt(o.Troom)} °C`;
    const th = info && info.thermostat;
    this.$('roominfo').textContent = th ? `${th.tag}: para a ${fmt(th.stop)} °C · arranca a ${fmt(th.start)} °C` : '';
    this.$('tprod').textContent = `género ${fmt(o.Tprod)} °C`;
    this.setTag('t-dis', `T descarga ${fmt(o.Tdis, 0)} °C`);
    this.setTag('t-liq', running ? `T líquido ${fmt(o.Tliq)} °C · SC ${fmt(o.SC)} K` : `T líquido ${fmt(o.Tliq)} °C`);
    this.setTag('t-filt', o.filterDT > 0.8 ? `tras filtro ${fmt(o.TafterFilter)} °C (Δ ${fmt(o.filterDT)} K)` : '');
    this.setTag('t-evin', `entrada ${fmt(o.TevapIn ?? o.Te)} °C`);
    this.setTag('t-evout', running ? `salida ${fmt(o.TevapOut)} °C · RC ${fmt(o.SHevap)} K` : `salida ${fmt(o.TevapOut)} °C`);
    this.setTag('t-suc', running ? `aspiración ${fmt(o.Tsuc)} °C` : `aspiración ${fmt(o.Tsuc)} °C`);
    this.setTag('t-coil', `batería ${fmt(o.Tcoil)} °C · hielo ${fmt(o.ice, 2)} kg`);
  }

  setGauge(g, p, T, suffix = '') {
    if (!g) return;
    const a = gaugeAngle(g, p);
    g.needle.setAttribute('transform', `rotate(${a.toFixed(1)})`);
    g.val.textContent = `${fmt(p)} bar`;
    g.sat.textContent = `${fmt(T)} °C${suffix}`;
  }

  /** Marca la pieza cuya tarjeta está abierta. */
  select(part) {
    for (const el of this.svg.querySelectorAll('[data-part].sel')) el.classList.remove('sel');
    if (part) for (const el of this.svg.querySelectorAll(`[data-part="${part}"]`)) el.classList.add('sel');
  }
}

function gaugeAngle(g, v) {
  const x = Math.max(g.min, Math.min(g.max * 1.04, v));
  return -225 + (270 * (x - g.min)) / (g.max - g.min);
}

function gaugeSVG(g, name, ref) {
  const R = 60;
  let s = `<circle class="g-face" r="${R}"/><circle class="g-rim" r="${R}"/>`;
  const span = g.max - g.min;
  const major = span <= 12 ? 1 : span <= 25 ? 5 : 5;
  const minor = span <= 12 ? 0.5 : 1;
  for (let v = g.min; v <= g.max + 1e-6; v += minor) {
    const a = (gaugeAngle(g, v) * Math.PI) / 180;
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r1 = R - 4;
    const r2 = isMajor ? R - 11 : R - 7;
    s += `<line class="${isMajor ? 'tk' : 'tk minor'}" x1="${(Math.cos(a) * r1).toFixed(1)}" y1="${(Math.sin(a) * r1).toFixed(1)}" x2="${(Math.cos(a) * r2).toFixed(1)}" y2="${(Math.sin(a) * r2).toFixed(1)}"/>`;
    if (isMajor && (span <= 12 ? Math.round(v) % 2 === 0 || v === g.min : true)) {
      const rt = R - 19;
      s += `<text class="tkl" x="${(Math.cos(a) * rt).toFixed(1)}" y="${(Math.sin(a) * rt).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${v}</text>`;
    }
  }
  // Escala interior de temperatura de saturación (como en los manómetros reales).
  const temps = (name === 'BAJA' ? [-40, -30, -20, -10, 0, 10, 20] : [-20, 0, 20, 40, 60]).filter((t) => {
    const p = gauge(name === 'BAJA' ? psatDew(ref, t) : psatBubble(ref, t));
    return p >= g.min && p <= g.max && t < ref.Tc - 2;
  });
  for (const t of temps) {
    const p = gauge(name === 'BAJA' ? psatDew(ref, t) : psatBubble(ref, t));
    const a = (gaugeAngle(g, p) * Math.PI) / 180;
    const rt = R - 30;
    s += `<text class="tks" x="${(Math.cos(a) * rt).toFixed(1)}" y="${(Math.sin(a) * rt).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${t}°</text>`;
  }
  s += `<text class="g-name" y="-16" text-anchor="middle">${name}</text>`;
  s += `<text class="g-ref" y="-6" text-anchor="middle">${ref.id} · bar</text>`;
  s += `<g class="needle"><line x1="0" y1="0" x2="${R - 12}" y2="0"/><circle r="4"/></g>`;
  s += `<rect class="g-panel" x="-34" y="${R + 6}" width="68" height="34" rx="4"/>`;
  s += `<text class="g-val" y="${R + 19}" text-anchor="middle" dominant-baseline="middle">—</text>`;
  s += `<text class="g-sat" y="${R + 32}" text-anchor="middle" dominant-baseline="middle">—</text>`;
  return s;
}

export { NS };
