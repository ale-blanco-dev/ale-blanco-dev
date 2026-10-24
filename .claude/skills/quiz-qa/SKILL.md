---
name: quiz-qa
description: Mandatory review gate for any English quiz, drill or exercise built for Alejandro (Spanish-speaking QA/SDET learning English). Use it BEFORE sending, publishing or republishing a quiz artifact, a mini-drill, or an answer key: it runs a validator script and a manual checklist that catch wrong answer keys, items with two defensible answers, explanations that contradict the key, hints that give away the answer, and exam-trick items native speakers don't follow. Never send a quiz that has not passed this skill.
---

# Quiz QA gate

The student lost trust because earlier quizzes shipped with a wrong answer key, an explanation that contradicted its own key, a sentence missing a word, a cue that looked like a verb to conjugate, "compare with item 13" references in a shuffled quiz, and items where native speakers would say the "wrong" option. This skill exists so that never happens again. Run all three steps every time, including after a "small" fix.

## Quizzes are paused
Since 2026-10-24 the student does not want quizzes; practice follows the `english-coach` skill (conversation, hidden targeting, gamification). Build a quiz only if he explicitly asks for one, and then this gate still applies.

## Student context (decides what counts as an error)
- Goal: a QA/SDET job in English. Target is **C1, not perfection**. Prefer job-relevant English.
- Do not test anything a native speaker commonly says both ways. Typical traps to avoid or rewrite:
  - "one of the engineers who maintain(s)" → use a clear antecedent ("The engineers who maintain…").
  - Subjunctive after demand/require/essential/vital with an indicative option ("reads", "is", "doesn't skip") among the distractors → British English accepts those; remove them from the options or accept them.
  - Collective nouns that take either verb (team, staff, company, management), "data is/are", pseudo-clefts with a plural complement ("What we need are more tests").
  - Casual "I'm thinking (that)…" for opinions; "is being" vs "is" with adjectives when both fit.
- Prefers multiple choice. Typed items only when asked.
- Spanish comprehension items (when present) must be correct Spanish, and must connect the English rule to Spanish where it helps (e.g. "la gente quiere" vs "people want").

## Step 1: run the validator
```
node .claude/skills/quiz-qa/scripts/validate_quiz.js <quiz.html|quiz.jsx|data.js> [more files]
```
It extracts `RAW_QUESTIONS` and checks structure (ids, 4 unique options, valid answer index, accepted answers, cue), explanation vs key (the `why` must mention the keyed answer), hints that contain a multi-word answer, references to item numbers (questions are shuffled), cues identical to an answer, and known ambiguity patterns. ERROR lines block publishing. WARN lines must each be looked at and either fixed or consciously accepted. Exit code 0 means no errors.

## Step 2: read every filled sentence
The validator prints each item with the keyed answer inserted. Read every one in full and answer, per item:
1. Is the completed sentence natural, complete English (no missing word, right punctuation)?
2. Plug in each distractor. Would any educated native speaker (US or UK, written or spoken) accept it in this context? If yes, the item is ambiguous: change the context, the options, or accept both.
3. Do the clue words (right now, since, yesterday, Look!, every Monday) force exactly one tense?
4. Does the `why` name the real subject or rule, and agree with the key?
5. Does the `hint` teach a technique without giving the answer?
6. Is it C1 and job-relevant rather than an exam trick (see Student context)?
7. Spanish items: is exactly one explanation right, are the wrong ones real misconceptions, and is the Spanish correct?

## Step 2b: play the page (whenever the app code changed)
If the quiz component itself changed (new item types, sections, layout), play it in a real browser before publishing:
```
cd <scratch dir> && npm install react@18.3.1 react-dom@18.3.1 @babel/standalone@7.24.7
NODE_PATH=<scratch dir>/node_modules:$(npm root -g) node .claude/skills/quiz-qa/scripts/smoke_test.js /abs/path/quiz.html
```
It answers every question, checks 4 options per item, Part 1 before Part 2, that the score and share text match the answers clicked, and that there are no page errors. It must print PASS.

## Step 3: fix, rerun, report
- Fix every problem in the source, rebuild the page if needed, and rerun Step 1 until it exits 0.
- Only then publish.
- Tell the student, in one or two lines, that the quiz passed the review: how many items were checked and what was fixed. If an earlier quiz turns out to have had an error, say so plainly and fix it.
