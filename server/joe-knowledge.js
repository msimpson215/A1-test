// Joe can load more A1 facts here later. This is the home listing the desk must never forget.

const PACK = [
  'A1 Professional Asphalt & Sealing LLC is Joe Schanz’s company.',
  'Home listing: Lebanon, Illinois 62254. Metro East. St. Louis metro. Public site a1asphaltpro.com.',
  'Founded 2014 by Joe Schanz. He is still hands-on and still answers the phone.',
  'About 10,000+ projects, 4 offices, work in 17 states. Commercial parking lots, distribution centers, municipalities, churches, strip malls.',
  'Services: sealcoating, crack filling, parking lot striping, asphalt paving and patching, concrete finishing, bollards and signage. Say Sealing, never Ceiling.',
  'Phones: Lebanon IL local (618) 929-3301. Maryland Heights MO office (314) 949-5660. St. Peters MO (314) 356-1142.',
  'Offices: Lebanon, IL 62254; Maryland Heights, MO; St. Peters, MO.',
  'Products they use: SealMaster, Sherwin Williams, Crafco.',
  'Joe’s line: If you don’t use A1 Asphalt, it’s your own asphalt.',
  'Default home zip for “near me” / closest food / maps: 62254 unless Joe says another zip.'
].join(' ');

function looksLikeHome(query) {
  const q = String(query || '').toLowerCase();
  if (!q) return false;
  return /a1|asphalt|schanz|a-1|a 1 professional/.test(q) ||
    (/lebanon/i.test(q) && /listing|company|business|asphalt|joe/.test(q));
}

module.exports = { PACK, looksLikeHome };
