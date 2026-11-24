import { buildSession, type CodeExercise, type Flashcard, type StudyMode } from "./quiz.ts";
import { createWorker, OEM } from "tesseract.js";
import "./styles.css";

const SAMPLE_NOTES = `# The water cycle

The water cycle describes how water moves between Earth's surface and the atmosphere.
Evaporation happens when heat from the sun turns liquid water into water vapor.
Condensation is when water vapor cools and forms tiny droplets in clouds.
Precipitation returns water to Earth as rain, snow, sleet, or hail.

Q: What causes evaporation?
A: Heat from the sun changes liquid water into water vapor.

## Why it matters

The cycle helps distribute fresh water around the planet. Plants also release water vapor through a process called transpiration.`;

const elements = {
  notes: document.querySelector<HTMLTextAreaElement>("#notes-input")!,
  file: document.querySelector<HTMLInputElement>("#file-input")!,
  photos: document.querySelector<HTMLInputElement>("#photo-input")!,
  ocrStatus: document.querySelector<HTMLElement>("#ocr-status")!,
  count: document.querySelector<HTMLElement>("#word-count")!,
  mode: document.querySelector<HTMLSelectElement>("#mode-select")!,
  sample: document.querySelector<HTMLButtonElement>("#sample-button")!,
  start: document.querySelector<HTMLButtonElement>("#start-button")!,
  empty: document.querySelector<HTMLElement>("#empty-state")!,
  study: document.querySelector<HTMLElement>("#study-area")!,
  badge: document.querySelector<HTMLElement>("#session-badge")!,
  progressLabel: document.querySelector<HTMLElement>("#progress-label")!,
  progressBar: document.querySelector<HTMLElement>("#progress-bar")!,
  timer: document.querySelector<HTMLElement>("#timer")!,
  flashcard: document.querySelector<HTMLElement>("#flashcard-view")!,
  cardQuestion: document.querySelector<HTMLElement>("#card-question")!,
  cardAnswer: document.querySelector<HTMLElement>("#card-answer")!,
  cardAnswerText: document.querySelector<HTMLElement>("#card-answer-text")!,
  reveal: document.querySelector<HTMLButtonElement>("#reveal-button")!,
  rating: document.querySelector<HTMLElement>("#rating-actions")!,
  again: document.querySelector<HTMLButtonElement>("#again-button")!,
  gotIt: document.querySelector<HTMLButtonElement>("#got-it-button")!,
  coding: document.querySelector<HTMLElement>("#coding-view")!,
  challengeTitle: document.querySelector<HTMLElement>("#challenge-title")!,
  challengePrompt: document.querySelector<HTMLElement>("#challenge-prompt")!,
  codeSample: document.querySelector<HTMLElement>("#code-sample")!,
  codeAnswer: document.querySelector<HTMLInputElement>("#code-answer")!,
  testResult: document.querySelector<HTMLElement>("#test-result")!,
  test: document.querySelector<HTMLButtonElement>("#test-button")!,
  nextChallenge: document.querySelector<HTMLButtonElement>("#next-challenge-button")!,
  complete: document.querySelector<HTMLElement>("#complete-view")!,
  completeTitle: document.querySelector<HTMLElement>("#complete-title")!,
  completeCopy: document.querySelector<HTMLElement>("#complete-copy")!,
  restart: document.querySelector<HTMLButtonElement>("#restart-button")!,
  feedback: document.querySelector<HTMLElement>("#feedback")!,
};

let cards: Flashcard[] = [];
let exercises: CodeExercise[] = [];
let mode: StudyMode = "flashcards";
let index = 0;
let correctAnswers = 0;
let timerInterval: number | undefined;
let secondsRemaining = 10 * 60;
let ocrWorker: Awaited<ReturnType<typeof createWorker>> | undefined;

const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;
const PUBLIC_BASE = import.meta.env.BASE_URL;

function updateWordCount(): void {
  const count = elements.notes.value.trim().split(/\s+/).filter(Boolean).length;
  elements.count.textContent = `${count} ${count === 1 ? "word" : "words"}`;
}

function updateOcrStatus(message: string): void {
  elements.ocrStatus.textContent = message;
  elements.ocrStatus.hidden = !message;
}

async function getOcrWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (!ocrWorker) {
    ocrWorker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${PUBLIC_BASE}ocr/worker.min.js`,
      corePath: `${PUBLIC_BASE}ocr/core/tesseract-core-lstm.wasm.js`,
      langPath: `${PUBLIC_BASE}ocr/lang`,
      gzip: true,
      logger: ({ status, progress }) => {
        const percent = Math.round(progress * 100);
        updateOcrStatus(`${status.replaceAll("_", " ")}${progress > 0 ? ` (${percent}%)` : "…"}`);
      },
    });
  }
  return ocrWorker;
}

async function preparePhoto(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the selected image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function scanPhotos(files: File[]): Promise<void> {
  const accepted: File[] = [];
  const rejected: string[] = [];

  for (const file of files.slice(0, MAX_PHOTOS)) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      rejected.push(`${file.name}: use a JPEG, PNG, or WebP image`);
    } else if (file.size > MAX_PHOTO_SIZE) {
      rejected.push(`${file.name}: images must be 10 MB or smaller`);
    } else {
      accepted.push(file);
    }
  }
  if (files.length > MAX_PHOTOS) rejected.push(`Only the first ${MAX_PHOTOS} photos were selected.`);
  if (accepted.length === 0) {
    updateOcrStatus(rejected.join(" "));
    return;
  }

  elements.photos.disabled = true;
  elements.start.disabled = true;
  const recognized: string[] = [];
  const failed: string[] = [];

  try {
    const worker = await getOcrWorker();
    for (const [index, file] of accepted.entries()) {
      updateOcrStatus(`Reading photo ${index + 1} of ${accepted.length}: ${file.name}`);
      try {
        const canvas = await preparePhoto(file);
        const result = await worker.recognize(canvas);
        const text = result.data.text.trim();
        if (text) recognized.push(text);
        else failed.push(`${file.name} (no text found)`);
      } catch (error) {
        console.error(`Could not read note photo "${file.name}".`, error);
        failed.push(`${file.name} (could not read image)`);
      }
    }

    if (recognized.length > 0) {
      const currentNotes = elements.notes.value.trimEnd();
      const pageBreak = currentNotes ? "\n\n---\n\n" : "";
      elements.notes.value = `${currentNotes}${pageBreak}${recognized.join("\n\n---\n\n")}`;
      updateWordCount();
      elements.notes.focus();
    }

    const summary = [
      recognized.length > 0 ? `Added text from ${recognized.length} photo${recognized.length === 1 ? "" : "s"}. Review and edit it below.` : "",
      failed.length > 0 ? `Couldn't read: ${failed.join(", ")}.` : "",
      rejected.length > 0 ? rejected.join(" ") : "",
    ].filter(Boolean).join(" ");
    updateOcrStatus(summary || "No text was found in the selected photos.");
  } catch (error) {
    console.error("Could not start the local OCR engine.", error);
    ocrWorker = undefined;
    updateOcrStatus("Couldn't start local OCR. Check your connection for the first model download, then try again.");
  } finally {
    elements.photos.disabled = false;
    elements.start.disabled = false;
    elements.photos.value = "";
  }
}

function setFeedback(message: string): void {
  elements.feedback.textContent = message;
  elements.feedback.hidden = !message;
}

function showEmptyWithFeedback(message: string): void {
  stopTimer();
  elements.study.hidden = true;
  elements.empty.hidden = false;
  elements.timer.hidden = true;
  elements.badge.textContent = "READY WHEN YOU ARE";
  setFeedback(message);
}

function hideAllViews(): void {
  elements.flashcard.hidden = true;
  elements.coding.hidden = true;
  elements.complete.hidden = true;
  elements.empty.hidden = true;
  elements.study.hidden = false;
}

function updateProgress(total: number, label: string): void {
  elements.progressLabel.textContent = `${label} ${index + 1} OF ${total}`;
  elements.progressBar.style.width = `${((index + 1) / total) * 100}%`;
}

function renderCard(): void {
  const card = cards[index];
  if (!card) return;
  hideAllViews();
  elements.flashcard.hidden = false;
  elements.badge.textContent = "FLASHCARDS";
  elements.timer.hidden = true;
  elements.cardQuestion.textContent = card.question;
  elements.cardAnswerText.textContent = card.answer;
  elements.cardAnswer.hidden = true;
  elements.reveal.hidden = false;
  elements.rating.hidden = true;
  updateProgress(cards.length, "CARD");
}

function renderCodeSample(exercise: CodeExercise): void {
  elements.codeSample.replaceChildren();
  elements.codeSample.append(document.createTextNode(exercise.before));
  const blank = document.createElement("span");
  blank.className = "code-blank";
  blank.textContent = "_____";
  elements.codeSample.append(blank, document.createTextNode(exercise.after));
}

function renderExercise(): void {
  const exercise = exercises[index];
  if (!exercise) return;
  hideAllViews();
  elements.coding.hidden = false;
  elements.badge.textContent = "TIMED CODING";
  elements.timer.hidden = false;
  elements.challengeTitle.textContent = `Mini test ${index + 1}`;
  elements.challengePrompt.textContent = exercise.prompt;
  elements.codeAnswer.value = "";
  elements.codeAnswer.disabled = false;
  elements.test.disabled = false;
  elements.testResult.textContent = "";
  elements.testResult.className = "test-result";
  elements.test.hidden = false;
  elements.nextChallenge.hidden = true;
  renderCodeSample(exercise);
  updateProgress(exercises.length, "TEST");
  elements.codeAnswer.focus();
}

function updateTimer(): void {
  const minutes = Math.floor(secondsRemaining / 60).toString().padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");
  elements.timer.textContent = `${minutes}:${seconds}`;
}

function stopTimer(): void {
  if (timerInterval !== undefined) {
    window.clearInterval(timerInterval);
    timerInterval = undefined;
  }
}

function startTimer(): void {
  stopTimer();
  secondsRemaining = 10 * 60;
  updateTimer();
  timerInterval = window.setInterval(() => {
    secondsRemaining -= 1;
    updateTimer();
    if (secondsRemaining <= 0) {
      stopTimer();
      elements.codeAnswer.disabled = true;
      elements.test.disabled = true;
      elements.nextChallenge.hidden = true;
      hideAllViews();
      elements.complete.hidden = false;
      elements.timer.hidden = true;
      elements.badge.textContent = "TIME'S UP";
      elements.progressLabel.textContent = "SESSION ENDED";
      elements.completeTitle.textContent = "Time's up.";
      elements.completeCopy.textContent = `You passed ${correctAnswers} of ${exercises.length} mini tests. Start over for another timed try.`;
    }
  }, 1000);
}

function showComplete(): void {
  stopTimer();
  hideAllViews();
  elements.complete.hidden = false;
  elements.timer.hidden = true;
  elements.badge.textContent = "ALL DONE";
  elements.progressLabel.textContent = "SESSION COMPLETE";
  elements.progressBar.style.width = "100%";
  if (mode === "coding") {
    elements.completeTitle.textContent = "Tests complete.";
    elements.completeCopy.textContent = `You passed ${correctAnswers} of ${exercises.length} mini tests. Nice work sticking with it.`;
  } else {
    elements.completeTitle.textContent = "Nice work.";
    elements.completeCopy.textContent = `You made it through ${cards.length} flashcards. Keep showing up and it will stick.`;
  }
}

function showCurrentItem(): void {
  setFeedback("");
  if (mode === "coding") renderExercise();
  else renderCard();
}

function startSession(): void {
  const source = elements.notes.value.trim();
  if (!source) {
    showEmptyWithFeedback("Add some Markdown first, or try the sample notes.");
    elements.notes.focus();
    return;
  }

  const selectedMode = elements.mode.value;
  const requestedMode = selectedMode === "coding" || selectedMode === "flashcards" ? selectedMode : "auto";
  const session = buildSession(source, requestedMode);
  mode = session.mode;
  cards = session.cards;
  exercises = session.exercises;
  index = 0;
  correctAnswers = 0;
  elements.test.disabled = false;

  if (mode === "coding" && exercises.length === 0) {
    showEmptyWithFeedback("Coding practice needs a code block with a word to test. Add a fenced code example or switch to flashcards.");
    return;
  }
  if (mode === "flashcards" && cards.length === 0) {
    showEmptyWithFeedback("I couldn't find study points. Add a heading with notes, bullet points, or Q: / A: pairs.");
    return;
  }

  setFeedback("");
  hideAllViews();
  if (mode === "coding") {
    elements.timer.hidden = false;
    startTimer();
  } else {
    stopTimer();
    elements.timer.hidden = true;
  }
  showCurrentItem();
}

elements.notes.addEventListener("input", updateWordCount);
elements.sample.addEventListener("click", () => {
  elements.notes.value = SAMPLE_NOTES;
  elements.mode.value = "auto";
  updateWordCount();
  setFeedback("");
});

elements.file.addEventListener("change", async () => {
  const file = elements.file.files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) {
    setFeedback("That file is over 1 MB. Try a smaller Markdown file.");
    elements.file.value = "";
    return;
  }
  try {
    elements.notes.value = await file.text();
    elements.mode.value = "auto";
    updateWordCount();
    setFeedback("");
  } catch (error) {
    console.error("Could not read the selected Markdown file.", error);
    setFeedback("Couldn't open that file. Try pasting the Markdown instead.");
  }
  elements.file.value = "";
});

elements.photos.addEventListener("change", () => {
  const files = Array.from(elements.photos.files ?? []);
  if (files.length > 0) void scanPhotos(files);
  else elements.photos.value = "";
});

elements.start.addEventListener("click", startSession);
elements.reveal.addEventListener("click", () => {
  elements.cardAnswer.hidden = false;
  elements.reveal.hidden = true;
  elements.rating.hidden = false;
});

elements.again.addEventListener("click", () => {
  cards.push(cards.splice(index, 1)[0]!);
  renderCard();
});

elements.gotIt.addEventListener("click", () => {
  index += 1;
  if (index >= cards.length) showComplete();
  else renderCard();
});

elements.test.addEventListener("click", () => {
  const exercise = exercises[index];
  if (!exercise) return;
  if (elements.codeAnswer.value.trim() === exercise.answer) {
    correctAnswers += 1;
    elements.testResult.textContent = "Test passed — exactly right.";
    elements.testResult.className = "test-result is-correct";
  } else {
    elements.testResult.textContent = "Not quite. Check the notes and give it another try.";
    elements.testResult.className = "test-result is-incorrect";
    return;
  }
  elements.codeAnswer.disabled = true;
  elements.test.hidden = true;
  elements.nextChallenge.hidden = false;
});

elements.codeAnswer.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !elements.test.hidden) elements.test.click();
});

elements.nextChallenge.addEventListener("click", () => {
  index += 1;
  if (index >= exercises.length) showComplete();
  else renderExercise();
});

elements.restart.addEventListener("click", () => {
  index = 0;
  correctAnswers = 0;
  elements.test.disabled = false;
  if (mode === "coding") startTimer();
  showCurrentItem();
});

updateWordCount();
