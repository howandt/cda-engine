import handler from "./api/bornehave-router.js";

async function runTest(detail) {
  const req = {
    method: "GET",
    query: {
      text: "barnet trækker sig fra fællesskabet, leger ofte alene og siger ikke meget i samling",
      age: "4",
      category: "social",
      tags: "tilbagetrækning,aleneleg,kontakt",
      detail
    }
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      console.log(`\n===== DETAIL: ${detail} =====`);
      console.log(JSON.stringify({
        statusCode: this.statusCode,
        headers: this.headers,
        body: payload
      }, null, 2));
      return this;
    },
    end() {
      return this;
    }
  };

  await handler(req, res);
}

await runTest("kort");
await runTest("lang");