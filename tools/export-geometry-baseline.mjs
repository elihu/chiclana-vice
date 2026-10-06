import fs from 'node:fs';
import { readWorld } from './world-files.mjs';
import { geographicHash } from './geographic-fingerprint.mjs';

// Solo tras revisar deliberadamente los cambios respecto a la referencia anterior.
fs.writeFileSync(
  'source-data/geometry-baseline.json',
  JSON.stringify(
    {
      sha256: geographicHash(readWorld()),
      covers:
        'origin, size, buildings[].p/holes/floors, roads[].p/name/type/w/bridge/oneway, areas, landmarks, trees',
      origin: 'Geografía de main 13f212e; alcance ampliado sin modificar las capas',
    },
    null,
    2,
  ) + '\n',
);
