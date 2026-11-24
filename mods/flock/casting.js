// Casting for the ranch: which animal an agent is, its name, and its colour variant.
// Adapted from herdr-middle-earth's casting.js (MIT).
export const COMMON = ["sheep", "goat", "rabbit", "chicken", "cow", "horse", "duck", "llama"];
export const RARE = ["fox", "owl", "dragon"];
export const RARE_CHANCE = 0.1;
// Share of rare draws; the dragon ends up about 1 in 100 overall.
export const RARE_WEIGHTS = { fox: 0.6, owl: 0.3, dragon: 0.1 };

export const NAMES = [
  "Clover", "Biscuit", "Pepper", "Maple", "Waffle", "Juniper", "Pickle", "Honey",
  "Mochi", "Nutmeg", "Poppy", "Ginger", "Daisy", "Pumpkin", "Marigold", "Sprout",
  "Truffle", "Button", "Cocoa", "Willow", "Pebble", "Saffron", "Peaches", "Basil",
  "Noodle", "Olive", "Hazel", "Biscotti",
];

// A random pick among the least-used animals in the pool: everyone gets a turn before anyone repeats.
export function pickAnimal(pool, used, random = Math.random) {
  const uses = (animal) => used.filter((u) => u === animal).length;
  const fewest = Math.min(...pool.map(uses));
  const choices = pool.filter((animal) => uses(animal) === fewest);
  return choices[Math.floor(random() * choices.length)];
}

// A fresh casting has a 10% chance of a rare animal; returns its id, or null.
export function drawRare(random = Math.random) {
  if (random() >= RARE_CHANCE) return null;
  const roll = random();
  let edge = 0;
  for (const id of RARE) {
    edge += RARE_WEIGHTS[id];
    if (roll < edge) return id;
  }
  return RARE[RARE.length - 1];
}

// The second animal of a kind gets the alternate colours, so two cows can be told apart.
export function variantFor(animal, used) {
  return used.includes(animal) ? 1 : 0;
}

// An unused name while the pool lasts; any name once every one is taken.
export function pickName(usedNames, random = Math.random) {
  const free = NAMES.filter((n) => !usedNames.includes(n));
  const pool = free.length ? free : NAMES;
  return pool[Math.floor(random() * pool.length)];
}

// Keeps every agent's animal, name and colour variant up to date. Pure: takes the stored state and the
// live lists, returns the new state and whether anything changed.
//   list: the agents shown; all: every terminal herdr knows (empty right after a start);
//   state: { cast, names, variants } as stored, keyed by terminal address.
export function castAgents(list, all, state, random = Math.random) {
  const cast = { ...state.cast };
  const names = { ...state.names };
  const variants = { ...state.variants };
  let changed = false;
  // terminals() is empty right after a start: pruning then would recast everyone.
  if (all.length) {
    const alive = new Set(all.filter((t) => t.state === "live").map((t) => t.address));
    for (const store of [cast, names, variants]) {
      for (const address of Object.keys(store)) if (!alive.has(address)) { delete store[address]; changed = true; }
    }
  }
  for (const a of list) {
    const current = cast[a.address];
    if (COMMON.includes(current) || RARE.includes(current)) continue;
    const animals = list.map((b) => cast[b.address]).filter(Boolean);
    const rare = drawRare(random);
    const animal = rare ?? pickAnimal(COMMON, animals.filter((x) => COMMON.includes(x)), random);
    cast[a.address] = animal;
    names[a.address] = pickName(Object.values(names), random);
    variants[a.address] = rare ? 0 : variantFor(animal, animals);
    changed = true;
  }
  return { cast, names, variants, changed };
}
