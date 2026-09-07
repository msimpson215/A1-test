// Coordinates measured off public/dierbergs/dierbergs-storefront-full.png at its
// natural 1440px width. Reference points in that capture:
//   nav row text sits at y 6-30; "Flowers & Gifts" ends at x 476
//   the red search/cart bar spans y 46-104
//   the main merchandise column spans x 222-1400
//   a full-width page gutter sits at y 711-770, below the last merchandise row
export const dierbergsLayout = {
  pageWidth: 1440,
  shopperNav: { left: 490, top: 2, width: 154, height: 30 },
  axonStrip: { left: 0, top: 105, width: 1440, height: 88 },
  // Hides the half-covered category icon row while the strip is open.
  stripFiller: { left: 222, top: 193, width: 1178, height: 33 },
  merchandiseStage: { left: 222, top: 226, width: 1178, height: 544 },
  cartPatch: { left: 1334, top: 52, width: 96, height: 48 },
  cartTarget: { left: 1348, top: 56, width: 72, height: 40 }
};
