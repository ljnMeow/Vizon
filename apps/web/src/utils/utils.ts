export function getAssetUrl(assetPath: string, importerUrl: string) {
  return new URL(assetPath, importerUrl).href;
}

