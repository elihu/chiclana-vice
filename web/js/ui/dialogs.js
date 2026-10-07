import { $ } from '../core/dom.js';
import { SAVE_KEY, JOBS as jobs } from '../../game-data.js';
import { applyQuality } from '../engine/renderer.js';
import { audio, gfx, pois, session, state, world } from '../core/state.js';
import { clearInput } from './input.js';
import { mute, toggleAudio } from '../engine/audio.js';
import { reloadGroundTexture } from '../world/loader.js';
import { rescue } from '../game/player.js';
import { save } from '../game/save.js';
import { toast } from './feedback.js';

// Dialog focus: the HUD becomes inert, focus moves inside, Tab cycles within the open
// dialog and focus returns to the opener on close.
let dialogOpener = null;

export function openDialog(target) {
  if (!dialogOpener) dialogOpener = document.activeElement;
  $('hud').inert = true;
  target?.focus?.();
}

export function closeDialog() {
  if (!$('modal').classList.contains('hidden') || !$('mapOverlay').classList.contains('hidden'))
    return;
  $('hud').inert = false;
  dialogOpener?.focus?.();
  dialogOpener = null;
}

export function trapFocus(e) {
  const overlay = ['mapOverlay', 'modal'].map($).find((o) => !o.classList.contains('hidden'));
  if (!overlay) return;
  const items = [...overlay.querySelectorAll('button, a[href], input')].filter(
      (el) => !el.closest('.hidden'),
    ),
    first = items[0],
    lastItem = items[items.length - 1];
  if (!first) return;
  const inside = overlay.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault();
    lastItem.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === lastItem)) {
    e.preventDefault();
    first.focus();
  }
}

export function modal(html) {
  session.paused = true;
  clearInput();
  mute();
  $('modalBody').innerHTML = html;
  const title = $('modalBody').querySelector('h2');
  if (title) title.id = 'modalTitle';
  $('modal').classList.remove('hidden');
  openDialog($('modalBody').querySelector('button') || $('closeModal'));
}

export function closeModal() {
  if (gfx.contextLost) return; // only reloading can bring the image back
  $('modal').classList.add('hidden');
  closeDialog();
  session.paused = false;
  gfx.needsRender = true;
  session.last = performance.now();
}

export function help() {
  if (gfx.contextLost) return;
  modal(
    `<span class="eyebrow">CHICLANA VICE / CALLES REALES</span><h2>El centro, de verdad.</h2><div class="controlTable"><b>Conducir</b><span>Móvil: GAS para avanzar, flechas para girar, FRENO para detenerte y marcha atrás si lo mantienes. TURBO en las rectas.<br>Teclado: WASD o flechas, espacio freno de mano.</span><b>A pie</b><span>BAJAR junto a una zona libre. Joystick para andar; CORRER para ir más rápido. Acércate a un coche detenido para SUBIR. Teclado: E.</span><b>Cámara</b><span>Arrastra la escena horizontal y verticalmente para mirar. En primera persona, la mirada se mantiene hasta que la cambies. El botón Cámara alterna seguimiento, primera persona y vista aérea. Tecla C.</span><b>Mapa</b><span>Busca cualquiera de las ${world.streetNames.length} calles con nombre del sector y selecciónala para trasladarte. Tecla M.</span><b>Encargos</b><span>Detente dentro del círculo dorado durante un segundo. Completa ${jobs.length} encargos y descubre ${pois.length} lugares.</span></div><h3>Qué es real y qué se aproxima</h3><p>Las calles y sus conexiones conservan coordenadas geográficas. Los ${world.city.buildings.length.toLocaleString('es-ES')} volúmenes de edificios y sus patios proceden de contornos oficiales. Los tejados y el suelo usan fotografía aérea PNOA.</p><p>El Ayuntamiento y el Mercado tienen fachadas modeladas a partir de fotografías; Constitución, La Vega, La Plaza y el tramo cercano de Caraza incorporan fachadas de mayor detalle, aproximadas; el piloto continúa por Álamo, García Gutiérrez y Corredera Baja. El resto son genéricas. Los pavimentos del entorno mejorado y el mobiliario son recreaciones; los pasos peatonales usan posiciones cartografiadas. Los árboles combinan puntos de OSM con distribución aproximada dentro de parques y de la plaza del Mercado. Las naves de Jesús Nazareno, San Telmo y San Juan Bautista tienen volúmenes y fachadas específicos, con alturas aproximadas a partir de referencias. La calle Jesús Nazareno incorpora fachadas interpretativas. ${world.city.buildings.filter((b) => b.heightSource).length} partes del piloto tienen alturas de cubierta estimadas de IGN / PNOA-LiDAR, primera cobertura 2008–2015; píxeles de unos 2,5 m y valores en pasos de 1 m. Se mantienen sus plantas catastrales. En los demás, la altura se estima con el número de plantas. Las proporciones verticales del Ayuntamiento se han interpretado del alzado y la sección de Rafael Suárez Almanzor y Victorín Agueda Goyeneche (proyecto de 2006), publicados por la Junta de Andalucía. El terreno es plano. Los monumentos tienen volúmenes simplificados. No es una reconstrucción fotogramétrica ni reproduce el nivel de detalle de GTA V.</p><h3>Fachadas: referencias fotográficas</h3><p>Modelado interpretativo a partir de <a href="https://commons.wikimedia.org/wiki/File:Ayuntamiento_de_Chiclana_de_la_Frontera.jpg" target="_blank" rel="noopener">Ayuntamiento, Jms1952 (2023)</a> y <a href="https://commons.wikimedia.org/wiki/File:Mercado_municioal_Chiclana.jpg" target="_blank" rel="noopener">Mercado, Xemenendura (2025)</a>, ambas CC BY-SA 4.0. Las fotos sirven de referencia: los detalles son geometría de juego, no una captura fotogramétrica.</p><p>Portada Jesús Nazareno: Xemenendura (29/12/2015), <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. San Telmo: Xemenendura (5/12/2021), CC BY-SA 4.0. San Telmo y San Juan Bautista: fichas de turismo.chiclana.es como referencia. IAPH: «Fachadas lateral y principal del Convento de Jesús Nazareno», Isabel Dugo Cobacho (23/8/2012), © Instituto Andaluz del Patrimonio Histórico, <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. Referencias, enlaces originales y revisión pendiente de figuras/alzado en los avisos detallados.</p><h3>Fuentes y créditos</h3><p>Calles: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores de OpenStreetMap · ODbL 1.0</a>. <a href="osm-world.json" download target="_blank" rel="noopener">Descargar capa OSM utilizada</a> · <a href="street-objects.json" download target="_blank" rel="noopener">Objetos de calle</a> · <a href="licenses/ODbL-1.0.txt" target="_blank" rel="noopener">Licencia ODbL</a>.<br>Ortofoto: obra derivada de PNOA 2022-07 © <a href="https://pnoa.ign.es/" target="_blank" rel="noopener">IGN / PNOA / SCNE</a>, CC BY 4.0.<br>Edificios: obra de juego transformada a partir de <a href="https://www.catastro.hacienda.gob.es/webinspire/" target="_blank" rel="noopener">D.G. del Catastro · INSPIRE BU</a>, descargada el 4/10/2026. Sin validez catastral.<br>Piloto de alturas: Obra derivada de PNOA-LiDAR MDSnE2,5 2008–2015 CC-BY 4.0 scne.es; consultado el 5/10/2026. Alturas derivadas aproximadas; fecha del vuelo local sin confirmar. <a href="https://pnoa.ign.es/pnoa-lidar/productos-a-descarga" target="_blank" rel="noopener">Datos y procedencia</a>.<br>Motor: Three.js, licencia MIT. Juego independiente, sin afiliación con Rockstar Games.</p><p>El progreso se guarda en este navegador; los encargos en curso vuelven a su inicio al recargar.</p><p><a href="THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Licencias y procedencia detalladas</a> · <a href="data-sources.json" target="_blank" rel="noopener">Manifiesto de datos</a></p><p><a href="arcade/">Abrir la versión arcade anterior</a></p><button class="primary" id="understood">VOLVER</button>`,
  );
  $('understood').onclick = closeModal;
}

export function pauseMenu() {
  if (gfx.contextLost) return;
  modal(
    `<span class="eyebrow">PAUSA / CENTRO DE CHICLANA</span><h2>Un momento en la Alameda.</h2><p>${state.job}/${jobs.length} encargos · ${state.found.size}/${pois.length} lugares · ${Math.floor(state.cash)} €</p><button class="primary" id="resume">VOLVER AL JUEGO</button><button class="primary secondary" id="full">PANTALLA COMPLETA</button><button class="primary secondary" id="audio">${audio.audioOn ? 'DESACTIVAR' : 'ACTIVAR'} SONIDO</button><button class="primary secondary" id="quality">${gfx.quality === 'low' ? 'CALIDAD NORMAL' : 'MODO MÓVIL LIGERO'}</button><button class="primary secondary" id="help">CONTROLES Y FUENTES</button><button class="primary secondary" id="rescue">REPARAR Y VOLVER A LA ALAMEDA · 100 €</button><button class="textButton" id="reset">Empezar una partida nueva</button>`,
  );
  $('resume').onclick = closeModal;
  $('help').onclick = help;
  $('audio').onclick = () => {
    toggleAudio();
    closeModal();
  };
  $('quality').onclick = () => {
    gfx.quality = gfx.quality === 'low' ? 'auto' : 'low';
    applyQuality();
    reloadGroundTexture();
    save();
    closeModal();
    toast(gfx.quality === 'low' ? 'Modo ligero activado' : 'Calidad normal', 2);
  };
  $('rescue').onclick = () => {
    rescue();
    closeModal();
  };
  $('full').onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
      try {
        await screen.orientation.lock('landscape');
      } catch {}
    } catch {
      toast('En este navegador, gira el móvil para jugar en horizontal.', 4);
    }
    closeModal();
  };
  $('reset').onclick = () => {
    modal(
      '<h2>¿Empezar de cero?</h2><p>Se borrará el progreso guardado de la versión 3D en este navegador.</p><button class="primary" id="yesReset">SÍ, NUEVA PARTIDA</button><button class="primary secondary" id="noReset">CONSERVAR MI PARTIDA</button>',
    );
    $('yesReset').onclick = () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {}
      location.reload();
    };
    $('noReset').onclick = pauseMenu;
  };
}
