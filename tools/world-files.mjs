import { worldBounds } from '../web/js/world/bounds.js';
import fs from 'node:fs';

export function readWorld(directory = 'web') {
  const manifest = JSON.parse(fs.readFileSync(`${directory}/world.json`, 'utf8'));
  const buildings = JSON.parse(fs.readFileSync(`${directory}/${manifest.files.buildings}`, 'utf8'));
  const osm = JSON.parse(fs.readFileSync(`${directory}/${manifest.files.osm}`, 'utf8'));
  return {
    origin: manifest.origin,
    bounds: worldBounds(manifest),
    roads: osm.roads,
    areas: osm.areas,
    landmarks: osm.landmarks,
    trees: osm.trees,
    buildings: buildings.buildings,
    meta: manifest.meta,
  };
}
