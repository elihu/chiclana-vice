import { audio, player } from '../core/state.js';
import { toast } from '../ui/feedback.js';

export function updateEngineSound() {
  if (audio.audioCtx && audio.engineGain) {
    audio.engineGain.gain.setTargetAtTime(
      audio.audioOn && player.car ? 0.022 : 0,
      audio.audioCtx.currentTime,
      0.1,
    );
    audio.engineOsc.frequency.setTargetAtTime(
      32 + Math.abs(player.speed) * 5,
      audio.audioCtx.currentTime,
      0.1,
    );
  }
}

export function mute() {
  if (audio.engineGain) audio.engineGain.gain.setTargetAtTime(0, audio.audioCtx.currentTime, 0.1);
}

export function toggleAudio() {
  audio.audioOn = !audio.audioOn;
  try {
    if (audio.audioOn && !audio.audioCtx) {
      audio.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audio.engineOsc = audio.audioCtx.createOscillator();
      audio.engineGain = audio.audioCtx.createGain();
      audio.engineOsc.type = 'sawtooth';
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineGain).connect(audio.audioCtx.destination);
      audio.engineOsc.start();
    }
    if (audio.audioOn) audio.audioCtx.resume();
    else mute();
  } catch {
    audio.audioOn = false;
  }
  toast(audio.audioOn ? 'Sonido del motor activado' : 'Sonido desactivado', 2);
}
