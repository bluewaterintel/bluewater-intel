/* Map header dropdowns sort alphabetically within each section. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const { SPECIES, PORT_GROUPS } = loadBw(["SPECIES", "PORT_GROUPS"]);

const sortNames = (items, getName) =>
  items.slice().sort((a, b) =>
    getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" }));

function isSorted(names) {
  for (let i = 1; i < names.length; i++) {
    if (names[i - 1].localeCompare(names[i], undefined, { sensitivity: "base" }) > 0) {
      return false;
    }
  }
  return true;
}

console.log("Species dropdown order (by category):");
for (const cat of ["offshore", "nearshore", "inshore"]) {
  const names = sortNames(
    SPECIES.filter((s) => s.cat === cat && s.id !== "all"),
    (s) => s.name
  ).map((s) => s.name);
  check(`${cat} species are A-Z`, isSorted(names));
  if (cat === "offshore") {
    check("Bigeye Tuna precedes Blue Marlin offshore", names.indexOf("Bigeye Tuna") < names.indexOf("Blue Marlin"));
    check("Blue Marlin precedes Bluefin Tuna offshore", names.indexOf("Blue Marlin") < names.indexOf("Bluefin Tuna"));
  }
}

console.log("\nPort dropdown order (by region):");
for (const group of PORT_GROUPS) {
  const names = sortNames(group.ports, (p) => p);
  check(`${group.label} ports are A-Z`, isSorted(names));
  if (group.label === "Mid-Atlantic") {
    check("Mid-Atlantic starts with Atlantic City", names[0] === "Atlantic City, NJ");
  }
}

done();
