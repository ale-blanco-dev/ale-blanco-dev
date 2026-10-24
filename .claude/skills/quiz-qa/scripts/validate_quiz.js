#!/usr/bin/env node
// Validates RAW_QUESTIONS in quiz pages/data files. Exit 1 on any ERROR.
const fs = require("fs");

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: validate_quiz.js <file> [file...]");
  process.exit(2);
}

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ").replace(/’/g, "'");
const SUBJ_TRIGGER = /\b(demand|demands|demanded|require|requires|required|insist|insists|insisted|recommend|recommends|recommended|suggest|suggests|suggested|essential|vital|crucial|imperative|necessary|important) that\b/i;
const COLLECTIVE_SUBJECT = /^(the|our|my|your|their|this|that)\s+([\w'-]+\s+){0,2}(team|staff|management|company|government|family|crew|committee)\s*,?\s*$/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text, w) => new RegExp(`(^|[^a-z0-9])${esc(norm(w))}([^a-z0-9]|$)`, "i").test(norm(text));

function loadQuestions(file) {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf("const RAW_QUESTIONS = [");
  if (start < 0) throw new Error("RAW_QUESTIONS not found");
  const end = src.indexOf("\n];", start);
  if (end < 0) throw new Error("closing '];' for RAW_QUESTIONS not found");
  const body = src.slice(start + "const RAW_QUESTIONS = ".length, end + 2);
  return eval("(" + body + ")");
}

function keyText(q) {
  if (q.type === "mc") return q.options && q.options[q.answer];
  if (q.type === "type") return q.accepted && q.accepted[0];
  return undefined;
}

function indicativeVariants(key) {
  const k = norm(key);
  const v = new Set();
  if (k === "be") ["is", "are", "was"].forEach((x) => v.add(x));
  if (k === "have") v.add("has");
  if (k === "not be") ["isn't", "is not"].forEach((x) => v.add(x));
  if (/^not \w+$/.test(k) && k !== "not be") {
    const base = k.slice(4);
    ["doesn't " + base, "does not " + base, "don't " + base].forEach((x) => v.add(x));
  }
  if (/^\w+$/.test(k)) {
    v.add(k + "s");
    v.add(k + "es");
    if (/[^aeiou]y$/.test(k)) v.add(k.slice(0, -1) + "ies");
  }
  return v;
}

let totalErrors = 0;
let totalWarns = 0;

for (const file of files) {
  let Q;
  try {
    Q = loadQuestions(file);
  } catch (e) {
    console.log(`ERROR ${file}: cannot load questions: ${e.message}`);
    totalErrors++;
    continue;
  }
  const errors = [];
  const warns = [];
  const err = (q, m) => errors.push(`ERROR #${q.id}: ${m}`);
  const warn = (q, m) => warns.push(`WARN  #${q.id}: ${m}`);
  const ids = new Set();

  for (const q of Q) {
    if (q.id === undefined) err(q, "missing id");
    if (ids.has(q.id)) err(q, "duplicate id");
    ids.add(q.id);
    for (const k of ["pattern", "hint", "why"]) if (!q[k]) err(q, `missing ${k}`);
    const isConcept = typeof q.prompt === "string";
    if (isConcept) {
      if (!q.sentence) err(q, "concept item needs 'sentence'");
    } else if (typeof q.before !== "string" || typeof q.after !== "string") {
      err(q, "needs string 'before' and 'after' (or 'prompt' + 'sentence')");
    }

    if (q.type === "mc") {
      if (!Array.isArray(q.options) || q.options.length !== 4) err(q, "mc needs exactly 4 options");
      else if (new Set(q.options.map(norm)).size !== 4) err(q, "duplicate options");
      if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < (q.options || []).length)) err(q, "answer index out of range");
    } else if (q.type === "type") {
      if (!Array.isArray(q.accepted) || !q.accepted.length) err(q, "typed item needs accepted[]");
      if (!q.cue) err(q, "typed item needs a cue");
      else if ((q.accepted || []).map(norm).includes(norm(q.cue))) warn(q, `cue "${q.cue}" is identical to an accepted answer; make sure it can't be read as 'conjugate this verb'`);
    } else {
      err(q, `unknown type "${q.type}"`);
    }

    const key = keyText(q);
    const texts = [q.hint, q.why, q.prompt].filter(Boolean).join(" ");
    if (/\bitems?\s*#?\d+/i.test(texts)) err(q, "refers to an item number; questions are shuffled, quote the sentence instead");

    if (key && !isConcept) {
      const why = q.why || "";
      const k = norm(key);
      const words = k.split(" ");
      const mentions = hasWord(why, k) || (words.length > 2 && hasWord(why, words.slice(0, 2).join(" ")));
      if (!mentions) err(q, `why does not mention the keyed answer "${key}" (explanation may contradict the key)`);
      if (q.type === "mc") {
        const tail = why.includes(":") ? why.slice(why.lastIndexOf(":") + 1) : "";
        const others = q.options.filter((o, i) => i !== q.answer && hasWord(tail, o) && !norm(key).includes(norm(o)));
        if (tail && others.length && !hasWord(tail, key)) err(q, `why concludes with ${JSON.stringify(others)}, not the keyed answer "${key}"`);
      }
      const keyInsideDistractor = q.type === "mc" && q.options.some((o, i) => i !== q.answer && norm(o).includes(k));
      if ((words.length >= 2 || k.length >= 5) && !keyInsideDistractor && hasWord(q.hint || "", k)) {
        warn(q, `hint contains the answer "${key}"`);
      }
    }

    if (!isConcept && typeof q.before === "string") {
      if (/\bone of (the|these|those|our|my|your|their)\b.*\b(who|that|which)\s*$/i.test(q.before) && !/\bonly one of\b/i.test(q.before)) warn(q, "'one of the X who ___': natives use singular and plural; use a clear antecedent");
      if (SUBJ_TRIGGER.test(q.before) && key) {
        const variants = indicativeVariants(key);
        if (q.type === "mc") {
          const bad = q.options.filter((o, i) => i !== q.answer && variants.has(norm(o)));
          if (bad.length) warn(q, `subjunctive item offers indicative option(s) ${JSON.stringify(bad)} that British English accepts`);
        } else if (q.type === "type") {
          const acc = new Set(q.accepted.map(norm));
          if (![...variants].some((x) => acc.has(x))) warn(q, "typed subjunctive item rejects the British indicative form; accept it or explain");
        }
      }
      if (COLLECTIVE_SUBJECT.test(q.before.trim())) warn(q, "collective noun right before the blank: singular and plural can both be acceptable");
      if (/\bdata\b/i.test(q.before)) warn(q, "'data' takes singular or plural; avoid it as the subject being tested");
      if (/^what\b/i.test(q.before.trim()) && !/^(a|an|the|this|that|one)\b/i.test(q.after.trim())) warn(q, "pseudo-cleft: if the complement is plural, 'are' is also accepted");
    }
  }

  console.log(`\n=== ${file}: ${Q.length} questions`);
  for (const q of Q) {
    const key = keyText(q);
    if (typeof q.prompt === "string") {
      console.log(`#${q.id} [${q.pattern}] ${q.sentence}\n    Q: ${q.prompt}\n    A: ${key}`);
    } else {
      const shown = q.type === "type" ? (q.accepted || []).join(" / ") : key;
      console.log(`#${q.id} [${q.pattern}] ${q.before} [${shown}] ${q.after}`);
    }
  }
  errors.forEach((m) => console.log(m));
  warns.forEach((m) => console.log(m));
  console.log(`--- ${file}: ${errors.length} error(s), ${warns.length} warning(s)`);
  totalErrors += errors.length;
  totalWarns += warns.length;
}

console.log(`\nTOTAL: ${totalErrors} error(s), ${totalWarns} warning(s)`);
process.exit(totalErrors ? 1 : 0);
