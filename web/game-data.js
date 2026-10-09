// Datos propios compartidos por el juego y los verificadores.
export const SAVE_KEY = 'chiclana-real-v2';
export const INITIAL_CASH = 250;
export const INITIAL_POSITION = { x: 170, z: -150 };
export const SPAWN_POSITION = { x: 178, z: -146 };
export const POPULATION = { traffic: 24, parked: 9, pedestrians: 28, pedestrianAttempts: 600 };
export const PLACES = [
  ['Mercado de Abastos', -235.67, -125.92],
  ['Puente Chico', 132, -230],
  ['Plaza Mayor', 188, 185],
  ['Arquillo del Reloj', 207.09, 140.89],
  ['Ayuntamiento', -76.2, -9.74],
  ['San Telmo', -27.11, -182.41],
  ['Ermita de Santa Ana', -226.59, 526.92],
  ['Puente VII Centenario', -480.12, -508.78],
];
export const VIEWPOINTS = [
  { name: 'Ayuntamiento · ver fachada', x: -99, z: -15, tx: -87, tz: -16 },
  { name: 'Mercado · ver fachada', x: -215, z: -145, tx: -238, tz: -137 },
  { name: 'Jesús Nazareno · ver fachada', x: -81, z: 69, tx: -62, tz: 76 },
  { name: 'San Telmo · ver fachada', x: -10, z: -155, tx: -12, tz: -167 },
  { name: 'Iglesia Mayor · ver fachada', x: 191, z: 163, tx: 212, tz: 167 },
  { name: 'Santa Ana · mirador', x: -238.6, z: 532, tx: 0, tz: 0 },
  { name: 'Puente VII Centenario · ver puente', x: -429.1, z: -522.1, tx: -480.1, tz: -508.8 },
];
export const JOBS = [
  {
    name: 'EL ENCARGO DEL MERCADO',
    reward: 450,
    limit: 150,
    stages: [
      { poi: 0, text: 'Recoge el pedido junto al Mercado' },
      { poi: 4, text: 'Entrega el pedido en el Ayuntamiento' },
    ],
  },
  {
    name: 'AL OTRO LADO DEL IRO',
    reward: 600,
    limit: 150,
    stages: [
      { poi: 1, text: 'Acércate a Puente Chico' },
      { poi: 5, text: 'Lleva el sobre hasta San Telmo' },
    ],
  },
  {
    name: 'LA VUELTA POR EL CENTRO',
    reward: 850,
    limit: 200,
    stages: [
      { poi: 2, text: 'Recoge a tu colega en Plaza Mayor' },
      { poi: 0, text: 'Haz una parada en el Mercado' },
      { poi: 3, text: 'Termina junto al Arquillo del Reloj' },
    ],
  },
  {
    name: 'QUE NO TE SIGAN',
    reward: 1100,
    limit: 180,
    stages: [
      { poi: 5, text: 'Recoge el paquete de San Telmo' },
      { poi: 4, text: 'Lleva el paquete al Ayuntamiento' },
      { poi: 4, text: 'Despista a la policía para cobrar', escape: true },
    ],
  },
  {
    name: 'LA SUBIDA A SANTA ANA',
    reward: 900,
    limit: 240,
    stages: [
      { poi: 7, text: 'Recoge el encargo en el Puente VII Centenario' },
      { poi: 6, text: 'Súbelo hasta la Ermita de Santa Ana' },
    ],
  },
];

export const PROGRESS_LIMITS = {
  key: SAVE_KEY,
  cash: INITIAL_CASH,
  jobs: JOBS.length,
  places: PLACES.length,
};
