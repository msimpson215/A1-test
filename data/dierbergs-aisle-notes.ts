import type { ShelfId } from "./dierbergs-catalogue";

/**
 * What someone who has worked an aisle for years knows about it.
 *
 * This is the part that cannot be derived from the item file. The file says a
 * loaf is 20 oz and costs $3.99; it does not say that "wheat" on a bag is not
 * whole grain, that shredded cheese is dusted with starch and so melts badly in
 * a sauce, or that aged cheddar is usually fine for someone who cannot drink
 * milk. That knowledge is the difference between a search box with a voice and
 * someone worth asking.
 *
 * It is kept out of the standing instructions and handed over with the search
 * results for the aisle in question, for exactly the reason the catalogue is
 * looked up rather than memorised: a paragraph per aisle is nothing at four
 * aisles and a forty-thousand-token prompt at a hundred. Milk knowledge costs
 * tokens when somebody is buying milk, and nothing when they are not.
 *
 * So this is the template. A new department is a new entry here plus its rows in
 * the item file — no changes to any of the machinery around it.
 */
export const AISLE_NOTES: Record<ShelfId, string> = {
  milk: `Fat runs whole, 2%, 1%, skim — skim, fat free and nonfat are the same carton.
Dierbergs' own comes in gallon and half gallon and is the cheapest milk in the case. There is no Dierbergs quart.
Lactose, as the cartons are labelled: Lactaid and Prairie Farms Lactose Free are ordinary milk with the lactose already broken down, so they taste like milk. fairlife is ultra filtered and labelled lactose free, with more protein and less sugar. a2 is NOT lactose free: it is milk whose protein is only the a2 kind. Say which is which and let them choose. Say nothing about how any of it will affect them.
Chocolate is the Dierbergs 1% chocolate half gallon. Organic is Horizon.`,

  bread: `Kinds: white, wheat, whole grain, sourdough, rye, bagels.
The thing most people are never told: "wheat" on a bag does not mean whole grain. Honey wheat is a soft sandwich loaf. For the real thing look for 100% whole wheat, or a whole grain loaf like Dave's Killer Bread. Be useful about it, not smug.
Bunny Bread is the cheap St. Louis white. Dierbergs Bakehouse is baked in this store — split top white, sourdough, St. Louis rye, pumpernickel, bagels — so no preservatives and it wants eating sooner. The Rustik Oven is the pricey artisan. Pepperidge Farm Farmhouse is the thick, dear shelf loaf.
St. Louis rye is a local thing and it is the Bakehouse loaf. Pumpernickel is a dark rye. The Pepperidge Farm Jewish rye is seedless, which matters to the people it matters to.
Labelled gluten free: Udi's, the softer sandwich loaf and the cheaper of the two; Canyon Bakehouse in white or seven grain; and Carbonaut, which carries both the gluten free and low carb labels. Mention kindly that it runs two to three times ordinary bread and some of it lives in the freezer case. Tell them to read the packet themselves — recipes change, and you cannot see the bag they are holding.
Low carb is a different label, not the same request: Nature's Own Keto is cheaper, Carbonaut lower again. Carb counts are printed on the packet.
Half loaves exist for one person: the Wonder mini and the half sourdough.`,

  eggs: `Sizes: large, extra large, jumbo. Recipes assume large, so if they are baking and want jumbo, say the count is not a straight swap.
Dierbergs' own dozen is by far the cheapest egg in the case — about two dollars against five or six for Eggland's Best — and it is the same grade A egg. Say so when price comes up.
The words people mix up, straightened out gently: cage free means no cage, still indoors. Free range means some way outside. Pasture raised means real outdoor space — that is Vital Farms and the Pete & Gerry's pasture dozen, the top of the ladder and priced like it. Organic is about feed and comes with free range.
Shell colour is the breed of hen and nothing else — brown and white are the same egg inside. If they are paying extra for brown on that basis, say so plainly and save them the money.
The 18 count is cheaper per egg than the dozen. Hard boiled is the Eggland's Best six pack, already cooked and peeled.
Eggs are the allergen themselves: there is no egg-free egg here, so if that is the need, say plainly this aisle cannot help rather than looking for a way round it.`,

  cheese: `Kinds: cheddar, swiss, provolone, mozzarella — in blocks, slices, shreds, cubes, fresh, and cut at the deli counter.
Cheddar runs mild, medium, sharp, extra sharp: that is age, and the sharper it is the longer it sat. Cabot and Tillamook for cheddar with age on it. Essential Everyday is cheapest.
Form is not a detail, it is the answer to what they are cooking. Shredded is dusted with starch so it does not clump, so it melts less smoothly than cheese grated off a block — worth a word if they are making a sauce. Blocks are cheaper by the ounce and the 32 oz family blocks much cheaper again. Fat free shredded barely melts; say so before they buy it.
For pizza it is the low moisture part skim mozzarella block. The BelGioioso fresh ball is for eating cold with tomatoes, not for melting — do not let them buy the wrong one.
Lactose, as a fact about the cheese rather than about them: aging breaks lactose down, so aged cheeses are naturally low in it. The Cabot extra sharp and aged Sargento slices are the well aged ones here; Essential Everyday swiss is the cheapest way in. One Kraft shredded cheddar is labelled lactose free outright. State what the aging does and what the label says, and stop there — do not tell them it will agree with them.
Smoked is a real preference: Sargento smokehouse cheddar and the smoked provolone. Plain provolone is the Essential Everyday one.`
};

export function notesFor(aisle: ShelfId | null | undefined): string {
  return aisle ? AISLE_NOTES[aisle] ?? "" : "";
}

/**
 * Every aisle's notes at once.
 *
 * The per-aisle version above is the answer for a real store, and the reasoning
 * holds: a hundred departments cannot all be in the prompt. This demo has four,
 * and handing over one aisle's worth meant a question that crossed two of them —
 * which cheeses are low in lactose if I can't drink milk, is the rye as soft as
 * the white — was answered with half the knowledge and no sign of the other
 * half. At four aisles the whole lot is about fifteen hundred tokens, which is
 * nothing set against being wrong in front of somebody.
 */
export function allNotes(): string {
  return (Object.keys(AISLE_NOTES) as ShelfId[])
    .map((aisle) => `${aisle}:\n${AISLE_NOTES[aisle]}`)
    .join("\n\n");
}
