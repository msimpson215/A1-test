// Coordinates measured off public/dierbergs/dierbergs-storefront-full.png at its
// natural 1440px width. Reference points in that capture:
//   nav link text runs y 20-30 (cap top 20, baseline 28), so its optical
//     centre is y 24; "Flowers & Gifts" ends at x 476 and the rhythm between
//     one link and the next is 16-17px
//   the red search/cart bar spans y 46-104
//   the main merchandise column spans x 222-1400
//   a full-width page gutter sits at y 711-770, below the last merchandise row
export const dierbergsLayout = {
  pageWidth: 1440,
  // Measured off the capture: Dierbergs' own "Weekly Ad" pill is 23px tall at
  // y 14-36, and nav links sit 17-18px apart. The shopper pill matches both.
  // Measured off Dierbergs' own "Weekly Ad" chip in the capture, which occupies
  // x 128-193, y 14-36. Sharing its top and height is what makes this read as
  // part of the nav rather than as something dropped on top of it.
  shopperNav: { left: 494, top: 14, width: 132, height: 23 },
  axonStrip: { left: 0, top: 105, width: 1440, height: 88 },
  // Hides the half-covered category icon row while the strip is open.
  stripFiller: { left: 222, top: 193, width: 1178, height: 33 },
  merchandiseStage: { left: 222, top: 226, width: 1178, height: 544 },
  cartPatch: { left: 1334, top: 52, width: 96, height: 48 },
  cartTarget: { left: 1348, top: 56, width: 72, height: 40 }
};
