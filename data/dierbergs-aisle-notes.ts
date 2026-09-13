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
Lactose: Lactaid and Prairie Farms Lactose Free are ordinary milk with the lactose already broken down, so they taste like milk. fairlife is ultra filtered — lactose free, more protein, less sugar. a2 is NOT lactose free: it is milk with only the a2 protein, which some people say sits easier. Say which is which and let them choose. Never promise how their body will react.
Chocolate is the Dierbergs 1% chocolate half gallon. Organic is Horizon.`,

  bread: `Kinds: white, wheat, whole grain, sourdough, rye, bagels.
The thing most people are never told: "wheat" on a bag does not mean whole grain. Honey wheat is a soft sandwich loaf. For the real thing look for 100% whole wheat, or a whole grain loaf like Dave's Killer Bread. Be useful about it, not smug.
Bunny Bread is the cheap St. Louis white. Dierbergs Bakehouse is baked in this store — split top white, sourdough, St. Louis rye, pumpernickel, bagels — so no preservatives and it wants eating sooner. The Rustik Oven is the pricey artisan. Pepperidge Farm Farmhouse is the thick, dear shelf loaf.
St. Louis rye is a local thing and it is the Bakehouse loaf. Pumpernickel is a dark rye. The Pepperidge Farm Jewish rye is seedless, which matters to the people it matters to.
Gluten free: Udi's is the softer sandwich loaf and the cheaper of the two. Canyon Bakehouse does a white and a seven grain. Carbonaut is gluten free and low carb both. Warn them kindly that it runs two to three times ordinary bread and some of it lives in the freezer case.
Low carb is a different request: Nature's Own Keto is cheaper, Carbonaut lower again.
Half loaves exist for one person: the Wonder mini and the half sourdough.`,

  eggs: `Sizes: large, extra large, jumbo. Recipes assume large, so if they are baking and want jumbo, say the count is not a straight swap.
Dierbergs' own dozen is by far the cheapest egg in the case — about two dollars against five or six for Eggland's Best — and it is the same grade A egg. Say so when price comes up.
The words people mix up, straightened out gently: cage free means no cage, still indoors. Free range means some way outside. Pasture raised means real outdoor space — that is Vital Farms and the Pete & Gerry's pasture dozen, the top of the ladder and priced like it. Organic is about feed and comes with free range.
Brown and white shells are the same egg from a different hen. If they think brown is healthier, tell them kindly it is not and save them the money.
The 18 count is cheaper per egg than the dozen. Hard boiled is the Eggland's Best six pack, already cooked and peeled.
Eggs are the allergen themselves: there is no egg-free egg here, so if that is the need, say plainly this aisle cannot help.`,

  cheese: `Kinds: cheddar, swiss, provolone, mozzarella — in blocks, slices, shreds, cubes, fresh, and cut at the deli counter.
Cheddar runs mild, medium, sharp, extra sharp: that is age, and the sharper it is the longer it sat. Cabot and Tillamook for cheddar with age on it. Essential Everyday is cheapest.
Form is not a detail, it is the answer to what they are cooking. Shredded is dusted with starch so it does not clump, so it melts less smoothly than cheese grated off a block — worth a word if they are making a sauce. Blocks are cheaper by the ounce and the 32 oz family blocks much cheaper again. Fat free shredded barely melts; say so before they buy it.
For pizza it is the low moisture part skim mozzarella block. The BelGioioso fresh ball is for eating cold with tomatoes, not for melting — do not let them buy the wrong one.
Lactose has a better answer here than in the milk case: aged hard cheeses lose nearly all their lactose in the making, so sharp cheddar and swiss usually sit fine with someone who cannot drink milk. The Cabot extra sharp and aged Sargento slices are well aged; Essential Everyday swiss is the cheapest way in. One Kraft shredded cheddar is labelled lactose free outright. Not a doctor — just the facts about the cheese.
Smoked is a real preference: Sargento smokehouse cheddar and the smoked provolone. Plain provolone is the Essential Everyday one.`
};

export function notesFor(aisle: ShelfId | null | undefined): string {
  return aisle ? AISLE_NOTES[aisle] ?? "" : "";
}
