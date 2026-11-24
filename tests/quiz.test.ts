import assert from "node:assert/strict";
import test from "node:test";
import { buildSession, detectMode } from "../src/quiz.ts";

test("turns explicit Q and A pairs into flashcards", () => {
  const session = buildSession("# Lesson\n\nQ: What is evaporation?\nA: Liquid water changes into vapor.", "auto");

  assert.equal(session.mode, "flashcards");
  assert.deepEqual(session.cards, [{
    question: "What is evaporation?",
    answer: "Liquid water changes into vapor.",
  }]);
});

test("keeps heading-based study points alongside explicit Q and A cards", () => {
  const session = buildSession(
    "# Lesson\n\nWater evaporates when warmed.\n\nQ: What causes evaporation?\nA: Heat.",
    "auto",
  );

  assert.equal(session.cards.length, 2);
  assert.equal(session.cards[0]?.answer, "Heat.");
  assert.equal(session.cards[1]?.answer, "Water evaporates when warmed.");
});

test("uses a quiz placeholder as the coding test answer", () => {
  const session = buildSession(
    "## Add two values\nComplete the function.\n\n```js\nconst total = {{answer:first}} + second;\n```",
    "auto",
  );

  assert.equal(session.mode, "coding");
  assert.equal(session.exercises.length, 1);
  assert.equal(session.exercises[0]?.answer, "first");
  assert.equal(session.exercises[0]?.before, "const total = ");
  assert.equal(session.exercises[0]?.after, " + second;\n");
});

test("does not mistake an ordinary code example for a coding assignment", () => {
  assert.equal(detectMode("## Example\n\n```js\nconst answer = 42;\n```"), "flashcards");
});
