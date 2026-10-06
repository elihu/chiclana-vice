import fs from 'node:fs';

// Publica la política común dentro del archivo de perfiles que el juego ya carga.
const profiles = JSON.parse(fs.readFileSync('web/facade-profiles.json', 'utf8'));
profiles.heightPolicy = JSON.parse(fs.readFileSync('source-data/height-policy.json', 'utf8'));
fs.writeFileSync('web/facade-profiles.json', JSON.stringify(profiles, null, 2) + '\n');
