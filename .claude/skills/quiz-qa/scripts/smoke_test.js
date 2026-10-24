#!/usr/bin/env node
// Plays a quiz page end to end in headless Chromium and checks scoring, option counts,
// Part 1 -> Part 2 ordering and page errors. CDN scripts are served from local npm packages.
// Setup (once, in any scratch dir):
//   npm install react@18.3.1 react-dom@18.3.1 @babel/standalone@7.24.7
//   NODE_PATH=<that dir>/node_modules node smoke_test.js /abs/path/quiz.html
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const file = process.argv[2];
if (!file) {
  console.error("usage: smoke_test.js /abs/path/quiz.html");
  process.exit(2);
}

const LOCAL = {
  "react.production.min.js": "react/umd/react.production.min.js",
  "react-dom.production.min.js": "react-dom/umd/react-dom.production.min.js",
  "babel.min.js": "@babel/standalone/babel.min.js",
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 900 } })).newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("page error: " + e.message));
  page.on("console", (m) => m.type() === "error" && problems.push("console error: " + m.text()));
  await page.route("https://cdnjs.cloudflare.com/**", (route) => {
    const rel = LOCAL[route.request().url().split("/").pop()];
    if (!rel) return route.abort();
    const dirs = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
    const found = dirs.map((d) => path.join(d, rel)).find((p) => fs.existsSync(p));
    if (!found) {
      problems.push(`cannot find ${rel} in NODE_PATH (see setup at the top of this file)`);
      return route.abort();
    }
    return route.fulfill({ path: found, contentType: "application/javascript" });
  });

  await page.goto("file://" + path.resolve(file));
  await page.waitForSelector(".card", { timeout: 20000 });
  const total = Number((await page.textContent(".qcount")).split("/").pop().trim());
  let correct = 0;
  let seenPart2 = false;

  for (let n = 0; n < total; n++) {
    const topics = (await page.$(".topics")) ? await page.textContent(".topics") : "";
    const isPart2 = topics.includes("Parte 2");
    if (seenPart2 && !isPart2) problems.push(`question ${n + 1}: Part 1 item after Part 2 started`);
    seenPart2 = seenPart2 || isPart2;

    const opts = await page.$$(".optbtn");
    if (opts.length) {
      if (opts.length !== 4) problems.push(`question ${n + 1}: ${opts.length} options`);
      const pick = opts[n % opts.length];
      await pick.click();
      if ((await pick.getAttribute("class")).includes("correct")) correct++;
    } else {
      await page.fill(".typeinput", "zzz");
      await page.press(".typeinput", "Enter");
    }
    await page.click(".feedbackbox .btn");
  }

  await page.waitForSelector(".results", { timeout: 5000 });
  const scoreLine = (await page.textContent(".scoreline")).trim();
  if (!scoreLine.includes(`${correct}/${total}`)) problems.push(`score line "${scoreLine}" != ${correct}/${total}`);
  const share = await page.inputValue("#share-textarea");
  if (!share.includes(`${correct}/${total}`)) problems.push("share text has the wrong score");

  console.log(`played ${total} questions, ${correct} clicked correct, score line: ${scoreLine}`);
  problems.forEach((p) => console.log("PROBLEM " + p));
  console.log(problems.length ? `FAIL: ${problems.length} problem(s)` : "PASS");
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
