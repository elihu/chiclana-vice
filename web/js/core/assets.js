// Cache-busting suffix shared by every runtime resource, passed by the entry module.
let ASSET_VERSION = null;

export function setAssetVersion(v) {
  ASSET_VERSION = v;
}

export const asset = (path) =>
  ASSET_VERSION ? path + '?v=' + encodeURIComponent(ASSET_VERSION) : path;
