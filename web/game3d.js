// Entrada del navegador: la versión común de recursos es el ?v= de este módulo.
import { startGame } from './js/app.js';

startGame({ version: new URL(import.meta.url).searchParams.get('v') });
