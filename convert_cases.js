// convert_cases.js
import fs from "fs";

// Læs din nuværende fil
const input = fs.readFileSync("data/CDA_Cases_Index.json", "utf8");

// Prøv at udtrække kun arrayet mellem [ og ]
const arrayPart = input.substring(input.indexOf("["), input.lastIndexOf("]") + 1);

// Evaluér den som JavaScript for at få et faktisk array
const data = eval(arrayPart); // <-- bruger eval her, fordi vi konverterer fra JS, ikke JSON

// Skriv det som gyldig JSON med anførselstegn osv.
fs.writeFileSync(
  "data/CDA_Cases_Index_fixed.json",
  JSON.stringify(data, null, 2),
  "utf8"
);

console.log("✅ Konverteret! Ny fil gemt som data/CDA_Cases_Index_fixed.json");
