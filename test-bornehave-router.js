import { routeBornehaveInput } from "./lib/bornehaveRouter.js";

const result = routeBornehaveInput({
  text: "barnet er 6 år og skal snart i skole, der er behov for overlevering og brobygning",
  age: 6,
  category: "overlevering",
  tags: ["skolestart", "overlevering", "brobygning"]
});

console.log(JSON.stringify(result, null, 2));