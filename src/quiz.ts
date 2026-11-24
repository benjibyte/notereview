export interface Flashcard {
  question: string;
  answer: string;
}

export interface CodeExercise {
  prompt: string;
  before: string;
  answer: string;
  after: string;
}

export type StudyMode = "flashcards" | "coding";

export interface StudySession {
  mode: StudyMode;
  cards: Flashcard[];
  exercises: CodeExercise[];
}

const CODE_FENCE = /```([^\n]*)\n([\s\S]*?)```/g;
const ANSWER_PLACEHOLDER = /\{\{answer:([^{}]+)\}\}/;
const CODE_KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "def", "do", "else", "export", "false", "finally", "for", "from", "function",
  "if", "import", "in", "let", "new", "null", "of", "print", "public", "return",
  "static", "this", "true", "try", "var", "void", "while",
]);

function cleanMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#]/g, "")
    .trim();
}

function parseCards(markdown: string): Flashcard[] {
  const content = markdown.replace(CODE_FENCE, "");
  const lines = content.split(/\r?\n/);
  const cards: Flashcard[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const questionMatch = lines[index]?.match(/^\s*(?:[-*]\s*)?Q:\s*(.+)$/i);
    if (questionMatch) {
      const answerLine = lines.slice(index + 1).find((line) => /^\s*(?:[-*]\s*)?A:\s*.+$/i.test(line));
      const answer = answerLine?.replace(/^\s*(?:[-*]\s*)?A:\s*/i, "");
      if (answer) {
        cards.push({ question: cleanMarkdown(questionMatch[1] ?? ""), answer: cleanMarkdown(answer) });
      }
    }
  }

  let heading = "";
  let sectionLines: string[] = [];
  const sections: Array<{ heading: string; body: string }> = [];
  const flushSection = (): void => {
    const body = cleanMarkdown(sectionLines.join(" ").replace(/^\s*[-*+]\s+/gm, ""));
    if (body) sections.push({ heading, body });
    sectionLines = [];
  };

  const noteLines = content.replace(/^\s*(?:[-*]\s*)?[QA]:.*$/gim, "").split(/\r?\n/);
  for (const line of noteLines) {
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flushSection();
      heading = cleanMarkdown(headingMatch[1] ?? "");
    } else if (line.trim() === "") {
      flushSection();
    } else {
      sectionLines.push(line.trim());
    }
  }
  flushSection();

  for (const section of sections) {
    const statements = section.body
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length >= 12);

    for (const statement of statements) {
      const question = section.heading
        ? `What should you remember about ${section.heading}?`
        : "What is the key idea?";
      cards.push({ question, answer: statement });
    }
  }

  return cards;
}

function findCodeAnswer(code: string): { start: number; end: number; answer: string } | undefined {
  const placeholderMatch = ANSWER_PLACEHOLDER.exec(code);
  if (placeholderMatch?.[1]) {
    return {
      start: placeholderMatch.index,
      end: placeholderMatch.index + placeholderMatch[0].length,
      answer: placeholderMatch[1].trim(),
    };
  }

  const identifiers = [...code.matchAll(/[A-Za-z_$][\w$]*/g)]
    .filter((match) => !CODE_KEYWORDS.has(match[0].toLowerCase()));
  const candidate = identifiers.find((match) => (match[0]?.length ?? 0) > 1);
  if (!candidate || candidate.index === undefined || !candidate[0]) return undefined;
  return {
    start: candidate.index,
    end: candidate.index + candidate[0].length,
    answer: candidate[0],
  };
}

function parseExercises(markdown: string): CodeExercise[] {
  const exercises: CodeExercise[] = [];
  const fenceMatches = [...markdown.matchAll(CODE_FENCE)];

  for (const match of fenceMatches) {
    const code = match[2] ?? "";
    const answer = findCodeAnswer(code);
    if (!answer) continue;

    const beforeFence = markdown.slice(0, match.index ?? 0);
    const precedingLines = beforeFence.trimEnd().split(/\r?\n/);
    const context: string[] = [];
    for (let index = precedingLines.length - 1; index >= 0; index -= 1) {
      const line = precedingLines[index]?.trim() ?? "";
      if (!line) {
        if (context.length > 0) break;
        continue;
      }
      if (/^#{1,6}\s/.test(line)) {
        context.unshift(cleanMarkdown(line.replace(/^#{1,6}\s+/, "")));
        break;
      }
      context.unshift(cleanMarkdown(line.replace(/^[-*+]\s+/, "")));
      if (context.join(" ").length > 180) break;
    }

    exercises.push({
      prompt: context.join(" ") || "Fill in the missing part of the code.",
      before: code.slice(0, answer.start),
      answer: answer.answer,
      after: code.slice(answer.end),
    });
  }

  return exercises;
}

export function detectMode(markdown: string): StudyMode {
  const withoutCode = markdown.replace(CODE_FENCE, "");
  const hasAssignmentLanguage = /\b(coding|programming)\s+assignment\b|\b(write|implement|create|complete)\s+(?:a\s+)?(?:function|program|class|algorithm)\b|\bsolve\s+(?:this|the)\s+(?:coding\s+)?challenge\b/i.test(withoutCode);
  const hasCodeExercise = [...markdown.matchAll(CODE_FENCE)]
    .some((match) => /\{\{answer:[^{}]+\}\}|_{3,}|\/\/\s*(?:todo|fill in)|#\s*(?:todo|fill in)/i.test(match[2] ?? ""));
  return hasAssignmentLanguage || hasCodeExercise ? "coding" : "flashcards";
}

export function buildSession(markdown: string, requestedMode: "auto" | StudyMode): StudySession {
  const mode = requestedMode === "auto" ? detectMode(markdown) : requestedMode;
  return {
    mode,
    cards: parseCards(markdown),
    exercises: parseExercises(markdown),
  };
}
