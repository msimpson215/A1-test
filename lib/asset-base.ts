// Static exports of this demo are served from a sub-path on a CDN, where
// root-relative asset URLs would not resolve. Next's assetPrefix only covers
// framework bundles, so plain <img> sources go through this prefix instead.
export const assetBase = process.env.NEXT_PUBLIC_ASSET_BASE ?? "";

export function asset(path: string): string {
  return `${assetBase}${path}`;
}
