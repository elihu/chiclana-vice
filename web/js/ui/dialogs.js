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
import { updateHUD } from './hud.js';

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
      (el) => !el.closest('.hidden') && el.tabIndex !== -1,
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

export function help(section = 'controls', onReturn = closeModal) {
  if (gfx.contextLost) return;
  const sections = ['controls', 'about', 'sources'];
  if (!sections.includes(section)) section = 'controls';
  modal(`
    <div class="helpLayout">
      <div class="helpHeading"><span class="eyebrow">CHICLANA VICE</span><h2>Guía del juego</h2></div>
      <div class="helpTabs" role="tablist" aria-label="Secciones de la guía">
        <button id="helpTab-controls" role="tab" aria-controls="helpPanel-controls">Controles</button>
        <button id="helpTab-about" role="tab" aria-controls="helpPanel-about">Sobre el mapa</button>
        <button id="helpTab-sources" role="tab" aria-controls="helpPanel-sources">Fuentes</button>
      </div>
      <div class="helpScroll">
        <section id="helpPanel-controls" role="tabpanel" aria-labelledby="helpTab-controls">
          <p class="helpLead">Conduce, baja del coche y descubre el centro a tu ritmo.</p>
          <div class="controlCards">
            <article><h3>Al volante</h3><p>Mueve el joystick hacia arriba para acelerar y hacia los lados para girar. Hacia abajo frena y da marcha atrás. Con el otro pulgar puedes mantener TURBO o FRENO. BAJAR te deja salir cuando te detienes. En Pausa puedes volver a flechas y pedales.</p><p class="keyboardHint">Teclado: <kbd>WASD</kbd> o flechas · <kbd>Espacio</kbd> freno de mano · <kbd>Mayús</kbd> turbo.</p></article>
            <article><h3>A pie</h3><p>Detente en una zona libre y pulsa BAJAR. Mueve el joystick para caminar y mantén CORRER para ir más rápido. Acércate a un coche detenido para SUBIR.</p><p class="keyboardHint">Teclado: <kbd>WASD</kbd> o flechas · <kbd>E</kbd> entrar y salir · <kbd>Mayús</kbd> correr.</p></article>
            <article><h3>Mira alrededor</h3><p>Arrastra la escena para mirar. Cámara alterna entre seguimiento, primera persona y vista aérea. En primera persona, la mirada se mantiene hasta que la cambies.</p><p class="keyboardHint">Teclado: <kbd>C</kbd> cambiar cámara.</p></article>
            <article><h3>Busca tu calle</h3><p>Abre el mapa y busca entre las ${world.streetNames.length} calles con nombre del sector. Al seleccionar una calle te trasladas a ella.</p><p class="keyboardHint">Teclado: <kbd>M</kbd> abrir mapa · <kbd>Esc</kbd> cerrar o pausar.</p></article>
          </div>
          <div class="helpMission"><h3>Encargos y descubrimientos</h3><p>Detente en el círculo dorado durante un segundo para entregar. Completa los ${jobs.length} encargos y descubre los ${pois.length} lugares, o explora libremente.</p><p>El progreso se guarda en este navegador; los encargos en curso vuelven a su inicio al recargar.</p></div>
        </section>
        <section id="helpPanel-about" role="tabpanel" aria-labelledby="helpTab-about"><h3>Qué es real y qué se aproxima</h3><p>Las calles y sus conexiones conservan coordenadas geográficas. Los ${world.city.buildings.length.toLocaleString('es-ES')} volúmenes de edificios y sus patios proceden de contornos oficiales. Los tejados y el suelo usan fotografía aérea PNOA.</p><p>El Ayuntamiento y el Mercado tienen fachadas modeladas a partir de fotografías; Constitución, La Vega, La Plaza y el tramo cercano de Caraza incorporan fachadas de mayor detalle, aproximadas; el piloto continúa por Álamo, García Gutiérrez y Corredera Baja. El resto son genéricas. Los pavimentos del entorno mejorado y el mobiliario son recreaciones; los pasos peatonales usan posiciones cartografiadas. Los árboles combinan puntos de OSM con distribución aproximada dentro de parques y de la plaza del Mercado. Jesús Nazareno, San Telmo, la Iglesia Mayor, la Ermita de la Veracruz y la Ermita de Santa Ana tienen volúmenes y fachadas específicos, y el Puente VII Centenario sus dos arcos, con alturas aproximadas a partir de fotografías y de la ortofoto. La calle Jesús Nazareno incorpora fachadas interpretativas. ${world.city.buildings.filter((b) => b.heightSource).length} partes del piloto tienen alturas de cubierta estimadas de IGN / PNOA-LiDAR, primera cobertura 2008–2015; píxeles de unos 2,5 m y valores en pasos de 1 m. Se mantienen sus plantas catastrales. En los demás, la altura se estima con el número de plantas. Las proporciones verticales del Ayuntamiento se han interpretado del alzado y la sección de Rafael Suárez Almanzor y Victorín Agueda Goyeneche (proyecto de 2006), publicados por la Junta de Andalucía. El relieve procede del modelo digital del terreno del IGN, remuestreado a unos 10 m; calles, puentes y plazas elevadas siguen perfiles aproximados de juego. Los monumentos tienen volúmenes simplificados. No es una reconstrucción fotogramétrica ni reproduce el nivel de detalle de GTA V.</p></section>
        <section id="helpPanel-sources" role="tabpanel" aria-labelledby="helpTab-sources"><h3>Fachadas: referencias fotográficas</h3><p>Modelado interpretativo a partir de <a href="https://commons.wikimedia.org/wiki/File:Ayuntamiento_de_Chiclana_de_la_Frontera.jpg" target="_blank" rel="noopener">Ayuntamiento, Jms1952 (2023)</a> y <a href="https://commons.wikimedia.org/wiki/File:Mercado_municioal_Chiclana.jpg" target="_blank" rel="noopener">Mercado, Xemenendura (2025)</a>, ambas CC BY-SA 4.0. Las fotos sirven de referencia: los detalles son geometría de juego, no una captura fotogramétrica.</p><p>Portada Jesús Nazareno: Xemenendura (29/12/2015), <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. San Telmo: Xemenendura (5/12/2021), CC BY-SA 4.0. San Telmo y San Juan Bautista: fichas de turismo.chiclana.es como referencia. Iglesia Mayor: Oscar Sanchez (28/9/2011), <a href="https://creativecommons.org/licenses/by-sa/3.0/es/" target="_blank" rel="noopener">CC BY-SA 3.0 ES</a>; Xemenendura (29/4/2023) y PEPE GADEIRAS (4/1/2011), CC BY-SA 4.0. Ermita de la Veracruz: Xemenendura (19/7/2022), CC BY-SA 4.0. Ermita de Santa Ana: Xemenendura (20/5/2023), CC BY-SA 4.0, y Carlosrs (10/3/2008), dominio público. IAPH: «Fachadas lateral y principal del Convento de Jesús Nazareno», Isabel Dugo Cobacho (23/8/2012), © Instituto Andaluz del Patrimonio Histórico, <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. Referencias, enlaces originales y revisión pendiente de figuras/alzado en los avisos detallados.</p><h3>Fuentes y créditos</h3><p>Calles: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores de OpenStreetMap · ODbL 1.0</a>. <a href="osm-world.json" download target="_blank" rel="noopener">Descargar capa OSM utilizada</a> · <a href="street-objects.json" download target="_blank" rel="noopener">Objetos de calle</a> · <a href="licenses/ODbL-1.0.txt" target="_blank" rel="noopener">Licencia ODbL</a>.<br>Ortofoto: obra derivada de PNOA 2025-07 © <a href="https://pnoa.ign.es/" target="_blank" rel="noopener">IGN / PNOA / SCNE</a>, CC BY 4.0.<br>Edificios: obra de juego transformada a partir de <a href="https://www.catastro.hacienda.gob.es/webinspire/" target="_blank" rel="noopener">D.G. del Catastro · INSPIRE BU</a>, descargada el 4/10/2026. Sin validez catastral.<br>Piloto de alturas: Obra derivada de PNOA-LiDAR MDSnE2,5 2008–2015 CC-BY 4.0 scne.es; consultado el 5/10/2026. Alturas derivadas aproximadas; fecha del vuelo local sin confirmar. <a href="https://pnoa.ign.es/pnoa-lidar/productos-a-descarga" target="_blank" rel="noopener">Datos y procedencia</a>.<br>Relieve: Obra derivada del MDT de España (5 m) CC-BY 4.0 IGN / PNOA / SCNE (scne.es); consultado el 7/10/2026. Cotas aproximadas; referencia vertical sin confirmar.<br>Motor: Three.js, licencia MIT. Juego independiente, sin afiliación con Rockstar Games.</p><p>El progreso se guarda en este navegador; los encargos en curso vuelven a su inicio al recargar.</p><p><a href="THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Licencias y procedencia detalladas</a> · <a href="data-sources.json" target="_blank" rel="noopener">Manifiesto de datos</a></p></section>
      </div>
      <div class="helpFooter"><button class="primary" id="understood">${onReturn === pauseMenu ? 'Volver a la pausa' : 'Volver'}</button></div>
    </div>
  `);
  function selectSection(next, focus = false) {
    for (const name of sections) {
      const selected = name === next;
      $('helpTab-' + name).setAttribute('aria-selected', String(selected));
      $('helpTab-' + name).setAttribute('tabindex', selected ? '0' : '-1');
      $('helpPanel-' + name).classList.toggle('hidden', !selected);
    }
    $('helpPanel-' + next).parentElement?.scrollTo(0, 0);
    if (focus) $('helpTab-' + next).focus();
  }
  for (const [index, name] of sections.entries()) {
    const button = $('helpTab-' + name);
    button.onclick = () => selectSection(name);
    button.onkeydown = (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % sections.length;
      else if (event.key === 'ArrowLeft') next = (index + sections.length - 1) % sections.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = sections.length - 1;
      else return;
      event.preventDefault();
      selectSection(sections[next], true);
    };
  }
  selectSection(section);
  $('helpTab-' + section).focus?.();
  $('understood').onclick = onReturn;
}

// Debe llamarse desde una pulsación; girar el dispositivo no concede activación.
export async function toggleFullscreen() {
  clearInput();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    toast('No se pudo activar pantalla completa. Puedes seguir jugando en el navegador.', 4);
  }
}

export function pauseMenu() {
  if (gfx.contextLost) return;
  modal(
    `<div class="pauseLayout">
      <div class="pauseSummary"><span class="eyebrow">CHICLANA VICE</span><h2>Partida en pausa</h2>
        <dl class="pauseStats"><div><dt>Encargos</dt><dd>${state.job} / ${jobs.length}</dd></div><div><dt>Lugares</dt><dd>${state.found.size} / ${pois.length}</dd></div><div><dt>Dinero</dt><dd>${Math.floor(state.cash)} €</dd></div></dl>
        <p>Tu progreso se guarda en este navegador.</p><button class="controlChoice" id="steerMode">Conducción: ${session.driveStick ? 'joystick' : 'flechas y pedales'}</button>
      </div>
      <div class="pauseActions">
        <button class="primary" id="resume">Seguir jugando</button>
        <button class="primary secondary" id="full">Pantalla completa</button>
        <button class="primary secondary" id="audio">Sonido: ${audio.audioOn ? 'activado' : 'desactivado'}</button>
        <button class="primary secondary" id="quality">${gfx.quality === 'low' ? 'Usar calidad normal' : 'Usar modo ligero'}</button>
        <button class="primary secondary" id="help">Guía del juego</button>
        <button class="primary secondary" id="rescue">Reparar y volver a la Alameda · 100 €</button>
        <button class="textButton" id="reset">Empezar una partida nueva</button>
      </div>
    </div>`,
  );
  $('resume').onclick = closeModal;
  $('steerMode').onclick = () => {
    clearInput();
    session.driveStick = !session.driveStick;
    updateHUD();
    pauseMenu();
  };
  $('help').onclick = () => help('controls', pauseMenu);
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
  $('full').onclick = () => {
    void toggleFullscreen();
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
