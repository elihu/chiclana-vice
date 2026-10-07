// Terreno: hoy plano. La capa de alturas real se conectará aquí (docs/plan-modular/TERRENO.md).
export const flatTerrain = Object.freeze({
  kind: 'flat',
  heightAt() {
    return 0;
  },
});

export function heightAt(terrain, x, z) {
  return terrain ? terrain.heightAt(x, z) : 0;
}
