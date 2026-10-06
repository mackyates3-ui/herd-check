/**
 * Match a spoken eartag to the current herd.
 *
 * Ranch tags mix digits, letter suffixes, and names (`102`, `23 X`, `102Y WU`,
 * `BLUE 5R`, `Fiona`). People read the same tag several ways ("one oh two",
 * "one hundred two", "one zero two", letter names, or a color for a letter).
 * Leading zeros stay significant because `09` and `9` are different animals.
 */

export interface TagCandidate {
  tag: string;
  score: number;
}

export type VoiceMatch =
  | { kind: "empty" }
  | { kind: "unique"; tag: string; score: number; heard: string }
  | { kind: "ambiguous"; heard: string; candidates: TagCandidate[] }
  | { kind: "unknown"; heard: string; suggestion: string; near: TagCandidate[] };

export type ConfidenceSource = "grammar" | "free";

type Atom =
  | { t: "num"; digits: string }
  | { t: "let"; ch: string }
  | { t: "word"; word: string };

interface ParsedTag {
  raw: string;
  atoms: Atom[];
  code: string;
}

type Sym =
  | { k: "d"; v: number }
  | { k: "teen"; v: number }
  | { k: "ten"; v: number }
  | { k: "h" }
  | { k: "th" }
  | { k: "and" }
  | { k: "let"; ch: string }
  | { k: "word"; word: string }
  | { k: "wordlet"; word: string; ch: string }
  | { k: "num"; digits: string };

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const;

const TEEN_WORDS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TEN_WORDS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

const DIGIT_WORD: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  nought: 0,
  one: 1,
  won: 1,
  two: 2,
  to: 2,
  too: 2,
  three: 3,
  four: 4,
  for: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
};

const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Spoken forms that are safe for the small Vosk English vocabulary. */
const LETTER_SPOKEN: Record<string, string[]> = {
  A: ["a", "ay"],
  B: ["bee", "blue"],
  C: ["see"],
  D: ["dee"],
  E: ["e"],
  F: ["ef"],
  G: ["gee", "green"],
  H: ["h"],
  I: ["eye"],
  J: ["jay"],
  K: ["kay"],
  L: ["el"],
  M: ["em"],
  N: ["en"],
  O: ["o"],
  P: ["pee", "purple"],
  Q: ["queue"],
  R: ["are", "red"],
  S: ["ess"],
  T: ["tee"],
  U: ["you"],
  V: ["vee"],
  W: ["double you", "white"],
  X: ["ex"],
  Y: ["why", "yellow"],
  Z: ["zee"],
};

const LETTER_WORD: Record<string, string> = {};
for (const [ch, forms] of Object.entries(LETTER_SPOKEN)) {
  for (const form of forms) {
    if (form.includes(" ")) continue;
    LETTER_WORD[form] = ch;
  }
}

const COLOR_WORD: Record<string, string> = {
  blue: "B",
  green: "G",
  red: "R",
  white: "W",
  yellow: "Y",
  orange: "O",
  purple: "P",
  pink: "P",
  black: "K",
};

const FILLER = new Set([
  "uh",
  "um",
  "ah",
  "er",
  "hmm",
  "hm",
  "tag",
  "eartag",
  "ear",
  "number",
  "cow",
  "cattle",
  "thats",
  "that's",
  "its",
  "it's",
  "it",
  "is",
  "the",
  "an",
  "please",
  "yes",
  "yeah",
  "count",
  "check",
  "checked",
  "hey",
  "ok",
  "okay",
  "so",
  "just",
  "like",
]);

const KNOWN_NAME = new Set(["NOTCH", "KERMIT", "FIONA", "ARCHIE", "BLUE"]);

export function parseTag(raw: string): ParsedTag {
  const original = raw.trim().replace(/\s+/g, " ");
  const atoms: Atom[] = [];
  for (const token of original.toUpperCase().split(" ")) {
    if (!token) continue;
    if (KNOWN_NAME.has(token) || (/^[A-Z]+$/.test(token) && token.length >= 4)) {
      atoms.push({ t: "word", word: token });
      continue;
    }
    const parts = token.match(/\d+|[A-Z]+/g) ?? [];
    for (const part of parts) {
      if (/^\d+$/.test(part)) atoms.push({ t: "num", digits: part });
      else for (const ch of part) atoms.push({ t: "let", ch });
    }
  }
  return { raw: original, atoms, code: atoms.map(atomText).join("") };
}

export function tagKey(tag: string): string {
  return parseTag(tag).code;
}

export function codePrefixes(tag: string): string[] {
  const prefixes: string[] = [];
  let acc = "";
  for (const atom of parseTag(tag).atoms) {
    acc += atomText(atom);
    prefixes.push(acc);
  }
  return prefixes;
}

function atomText(atom: Atom): string {
  if (atom.t === "num") return atom.digits;
  if (atom.t === "let") return atom.ch;
  return atom.word;
}

export function digitsOh(digits: string): string {
  return [...digits].map((d) => (d === "0" ? "oh" : DIGIT_WORDS[Number(d)])).join(" ");
}

export function digitsZero(digits: string): string {
  return [...digits].map((d) => DIGIT_WORDS[Number(d)]).join(" ");
}

export function cardinal(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 9999) return "";
  if (n < 10) return DIGIT_WORDS[n] ?? "";
  if (n < 20) return TEEN_WORDS[n - 10] ?? "";
  if (n < 100) {
    const ten = TEN_WORDS[Math.floor(n / 10)] ?? "";
    const unit = n % 10;
    return unit ? `${ten} ${DIGIT_WORDS[unit]}` : ten;
  }
  if (n < 1000) {
    const head = `${DIGIT_WORDS[Math.floor(n / 100)]} hundred`;
    const rest = n % 100;
    return rest ? `${head} ${cardinal(rest)}` : head;
  }
  const head = `${DIGIT_WORDS[Math.floor(n / 1000)]} thousand`;
  const rest = n % 1000;
  return rest ? `${head} ${cardinal(rest)}` : head;
}

function numberPhraseOptions(digits: string): string[] {
  const forms: string[] = [digitsOh(digits)];
  const withZero = digitsZero(digits);
  if (withZero !== forms[0]) forms.push(withZero);
  if (!digits.startsWith("0")) {
    const words = cardinal(Number(digits));
    if (words && !forms.includes(words)) forms.push(words);
    if (digits.length === 4) {
      const head = Number(digits.slice(0, 2));
      if (head >= 10) {
        const grouped = `${cardinal(head)} ${digitsOh(digits.slice(2))}`;
        if (!forms.includes(grouped)) forms.push(grouped);
      }
    }
    if (digits.length === 3) {
      const tail = Number(digits.slice(1));
      if (tail >= 10) {
        const split = `${DIGIT_WORDS[Number(digits[0])]} ${cardinal(tail)}`;
        if (!forms.includes(split)) forms.push(split);
      }
    }
  }
  return forms;
}

/** Natural phrases for one tag, preferred form first. Used by the recognizer grammar. */
export function spokenForms(tag: string): string[] {
  const { atoms } = parseTag(tag);
  if (atoms.length === 0) return [];
  const options = atoms.map((atom) => {
    if (atom.t === "num") return numberPhraseOptions(atom.digits);
    if (atom.t === "let") return LETTER_SPOKEN[atom.ch] ?? [atom.ch.toLowerCase()];
    return [atom.word.toLowerCase()];
  });
  const out: string[] = [];
  const add = (parts: string[]) => {
    const phrase = parts.join(" ").replace(/\s+/g, " ").trim();
    if (phrase && !out.includes(phrase)) out.push(phrase);
  };
  add(options.map((choices) => choices[0] ?? ""));
  const numberIndex = atoms.findIndex((atom) => atom.t === "num");
  if (numberIndex >= 0) {
    for (const numForm of options[numberIndex] ?? []) {
      add(options.map((choices, index) => (index === numberIndex ? numForm : (choices[0] ?? ""))));
    }
  }
  atoms.forEach((atom, index) => {
    if (atom.t !== "let") return;
    const alt = options[index]?.[1];
    if (!alt) return;
    add(options.map((choices, choiceIndex) => (choiceIndex === index ? alt : (choices[0] ?? ""))));
  });
  if (numberIndex === 0 && atoms.some((atom) => atom.t !== "num")) {
    for (const numForm of options[0] ?? []) add([numForm]);
  }
  return out;
}

export function primaryPhrase(tag: string): string {
  return spokenForms(tag)[0] ?? tag.trim().toLowerCase();
}

export function genericNumberPhrases(max = 450): string[] {
  const out: string[] = [];
  for (let n = 0; n <= max; n += 1) {
    const digits = String(n);
    out.push(n < 10 ? DIGIT_WORDS[n] : digitsOh(digits));
    if (n >= 20) {
      const words = cardinal(n);
      if (!out.includes(words)) out.push(words);
    }
  }
  for (let n = 1900; n <= 1920; n += 1) out.push(digitsOh(String(n)));
  return out;
}

export function grammarPhrases(tags: string[], vocab: Set<string> | null = null): string[] {
  const phrases = new Set<string>();
  const add = (phrase: string) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    if (vocab && words.some((word) => !vocab.has(word))) return;
    phrases.add(words.join(" "));
  };
  for (const tag of tags) {
    for (const phrase of spokenForms(tag)) add(phrase);
  }
  for (const phrase of genericNumberPhrases()) add(phrase);
  if (!vocab || vocab.has("[unk]")) phrases.add("[unk]");
  return [...phrases];
}

export function grammarJson(tags: string[], vocab: Set<string> | null = null): string {
  return JSON.stringify(grammarPhrases(tags, vocab));
}

function preprocess(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bdouble\s+you\b/g, " w ")
    .replace(/\bdouble\s+u\b/g, " w ")
    .replace(/\s+/g, " ")
    .trim();
}

function lex(raw: string): Sym[] {
  const tokens = preprocess(raw).split(" ").filter(Boolean);
  const symbols: Sym[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i] ?? "";
    if (!tok || tok === "unk") continue;
    if (tok === "a" && tokens[i + 1] !== "hundred") continue;
    if (FILLER.has(tok)) continue;
    if (tok === "and") {
      symbols.push({ k: "and" });
      continue;
    }
    if (tok === "hundred") {
      symbols.push({ k: "h" });
      continue;
    }
    if (tok === "thousand") {
      symbols.push({ k: "th" });
      continue;
    }
    if (TEENS[tok] != null) {
      symbols.push({ k: "teen", v: TEENS[tok] });
      continue;
    }
    if (TENS[tok] != null) {
      symbols.push({ k: "ten", v: TENS[tok] });
      continue;
    }
    if (DIGIT_WORD[tok] != null) {
      symbols.push({ k: "d", v: DIGIT_WORD[tok] });
      continue;
    }
    if (COLOR_WORD[tok]) {
      symbols.push({ k: "wordlet", word: tok, ch: COLOR_WORD[tok] });
      continue;
    }
    if (LETTER_WORD[tok]) {
      symbols.push({ k: "let", ch: LETTER_WORD[tok] });
      continue;
    }
    if (/^\d+$/.test(tok)) {
      symbols.push({ k: "num", digits: tok });
      continue;
    }
    const mixed = tok.match(/^(\d+)([a-z]+)$/);
    if (mixed) {
      symbols.push({ k: "num", digits: mixed[1] ?? "" });
      pushLetters(symbols, mixed[2] ?? "");
      continue;
    }
    if (/^[a-z]{1,3}$/.test(tok)) {
      pushLetters(symbols, tok);
      continue;
    }
    symbols.push({ k: "word", word: tok });
  }
  return symbols;
}

function pushLetters(symbols: Sym[], text: string) {
  for (const ch of text) symbols.push({ k: "let", ch: ch.toUpperCase() });
}

function maximalDigitRun(symbols: Sym[], i: number): { digits: string; next: number } | null {
  let j = i;
  let digits = "";
  while (j < symbols.length) {
    const sym = symbols[j];
    if (sym?.k === "d") {
      digits += String(sym.v);
      j += 1;
      continue;
    }
    if (sym?.k === "num") {
      digits += sym.digits;
      j += 1;
      continue;
    }
    break;
  }
  return digits ? { digits, next: j } : null;
}

function parseCardinal(symbols: Sym[], i: number): { digits: string; next: number } | null {
  let j = i;
  let total = 0;
  let current = 0;
  let consumed = false;
  const takeDigit = (value: number) => {
    if (current === 0) {
      current = value;
      return true;
    }
    if (current >= 20 && current < 100 && current % 10 === 0 && value > 0 && value < 10) {
      current += value;
      return true;
    }
    return false;
  };
  while (j < symbols.length) {
    const sym = symbols[j];
    if (!sym) break;
    if (sym.k === "and") {
      if (!consumed) break;
      j += 1;
      continue;
    }
    if (sym.k === "d") {
      if (!takeDigit(sym.v)) break;
      consumed = true;
      j += 1;
      continue;
    }
    if (sym.k === "num" && sym.digits.length === 1) {
      if (!takeDigit(Number(sym.digits))) break;
      consumed = true;
      j += 1;
      continue;
    }
    if (sym.k === "teen") {
      if (current !== 0) break;
      current = sym.v;
      consumed = true;
      j += 1;
      continue;
    }
    if (sym.k === "ten") {
      if (current !== 0) break;
      current = sym.v;
      consumed = true;
      j += 1;
      continue;
    }
    if (sym.k === "h") {
      if (current === 0) current = 1;
      total += current * 100;
      current = 0;
      consumed = true;
      j += 1;
      continue;
    }
    if (sym.k === "th") {
      if (current === 0) current = 1;
      total = (total + current) * 1000;
      current = 0;
      consumed = true;
      j += 1;
      continue;
    }
    if (
      (sym.k === "let" || sym.k === "wordlet") &&
      sym.ch === "A" &&
      symbols[j + 1]?.k === "h"
    ) {
      current = 1;
      consumed = true;
      j += 1;
      continue;
    }
    break;
  }
  if (!consumed) return null;
  return { digits: String(total + current), next: j };
}

function radioChunk(symbols: Sym[], i: number): { digits: string; next: number } | null {
  const sym = symbols[i];
  if (!sym) return null;
  if (sym.k === "teen") return { digits: String(sym.v), next: i + 1 };
  if (sym.k === "ten") {
    const next = symbols[i + 1];
    if (next?.k === "d" && next.v > 0) return { digits: String(sym.v + next.v), next: i + 2 };
    return { digits: String(sym.v), next: i + 1 };
  }
  if (sym.k === "d") return { digits: String(sym.v), next: i + 1 };
  if (sym.k === "num") return { digits: sym.digits, next: i + 1 };
  return null;
}

function parseRadio(symbols: Sym[], i: number): { digits: string; next: number } | null {
  let j = i;
  let digits = "";
  let chunks = 0;
  while (j < symbols.length) {
    const chunk = radioChunk(symbols, j);
    if (!chunk) break;
    digits += chunk.digits;
    j = chunk.next;
    chunks += 1;
  }
  return chunks > 0 ? { digits, next: j } : null;
}

function consumeNumber(symbols: Sym[], i: number): Array<{ digits: string; next: number }> {
  const run = maximalDigitRun(symbols, i);
  const card = parseCardinal(symbols, i);
  const radio = parseRadio(symbols, i);
  const ways: Array<{ digits: string; next: number }> = [];
  const push = (way: { digits: string; next: number } | null) => {
    if (!way || !way.digits) return;
    if (ways.some((item) => item.digits === way.digits && item.next === way.next)) return;
    ways.push(way);
  };
  const keepsZero = [run, radio].some(
    (way) =>
      card &&
      way &&
      way.next === card.next &&
      way.digits.startsWith("0") &&
      way.digits.length > card.digits.length,
  );
  push(run);
  if (card && !keepsZero) push(card);
  push(radio);
  return ways;
}

export function interpretSpoken(raw: string): string[] {
  const symbols = lex(raw);
  const out: string[] = [];
  const add = (code: string) => {
    if (code && !out.includes(code)) out.push(code);
  };
  const literal = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (literal && /\d/.test(literal)) add(literal);

  const tail = (index: number, acc: string) => {
    let j = index;
    let code = acc;
    while (j < symbols.length) {
      const sym = symbols[j];
      if (!sym) return;
      if (sym.k === "let" || sym.k === "wordlet") {
        code += sym.ch;
        j += 1;
        continue;
      }
      if (sym.k === "word") {
        code += sym.word.toUpperCase();
        j += 1;
        continue;
      }
      if (sym.k === "and") {
        j += 1;
        continue;
      }
      return;
    }
    add(code);
  };

  const from = (index: number, acc: string) => {
    if (out.length > 16) return;
    if (index >= symbols.length) {
      add(acc);
      return;
    }
    for (const way of consumeNumber(symbols, index)) tail(way.next, acc + way.digits);
    const sym = symbols[index];
    if (sym?.k === "word" || sym?.k === "wordlet") from(index + 1, acc + sym.word.toUpperCase());
  };
  from(0, "");
  return out;
}

function boundaryPrefixes(tag: ParsedTag): string[] {
  const prefixes: string[] = [];
  let acc = "";
  for (const atom of tag.atoms) {
    acc += atomText(atom);
    prefixes.push(acc);
  }
  return prefixes;
}

function sameLetters(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join("") === [...b].sort().join("");
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + cost);
      diag = up;
      prev[j] = next;
    }
  }
  return prev[b.length] ?? 99;
}

function scoreCode(code: string, tag: ParsedTag, all: ParsedTag[]): number {
  if (!code || !tag.code) return 0;
  if (code === tag.code) return 1;
  const prefixes = boundaryPrefixes(tag);
  if (prefixes.includes(code)) {
    const first = tag.atoms[0];
    if (!first || first.t !== "num" || code.length >= first.digits.length) return 0.9;
    return 0;
  }
  const spoken = code.match(/^(\d+)([A-Z]+)$/);
  const target = tag.code.match(/^(\d+)([A-Z]+)$/);
  if (spoken && target && spoken[1] === target[1] && spoken[2] && target[2] && sameLetters(spoken[2], target[2])) {
    return 0.88;
  }
  if (code.startsWith(tag.code) && /^[A-Z]+$/.test(code.slice(tag.code.length))) return 0.74;
  const wordHit = tag.atoms.some((atom) => atom.t === "word" && code === atom.word);
  if (wordHit) {
    const owners = all.filter((item) => item.atoms.some((atom) => atom.t === "word" && atom.word === code));
    if (owners.length === 1) return 0.9;
  }
  if (Math.min(code.length, tag.code.length) >= 3 && levenshtein(code, tag.code) === 1) return 0.64;
  return 0;
}

export function formatTagSuggestion(code: string): string {
  const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffixed = upper.match(/^(\d+)([A-Z])([A-Z]{2})$/);
  if (suffixed) return `${suffixed[1]}${suffixed[2]} ${suffixed[3]}`;
  const named = upper.match(/^(\d+)([A-Z]{4,})$/);
  if (named) return `${named[1]} ${named[2]}`;
  const wordFirst = upper.match(/^([A-Z]{4,})(\d+)([A-Z]+)$/);
  if (wordFirst) return `${wordFirst[1]} ${wordFirst[2]}${wordFirst[3]}`;
  const oneLetter = upper.match(/^(\d+)([A-Z])$/);
  if (oneLetter) return `${oneLetter[1]} ${oneLetter[2]}`;
  return upper;
}

export function matchSpoken(transcript: string, tags: string[]): VoiceMatch {
  const heard = transcript.replace(/\s+/g, " ").trim();
  if (!heard || heard === "[unk]" || heard.toLowerCase() === "unk") return { kind: "empty" };
  const codes = interpretSpoken(heard);
  const parsed = tags.map(parseTag);
  const scored = parsed
    .map((tag) => {
      let score = 0;
      for (const code of codes) score = Math.max(score, scoreCode(code, tag, parsed));
      return { tag: tag.raw, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag, undefined, { numeric: true }));

  const best = scored[0];
  const suggestion = suggestionFor(heard, codes, parsed);
  if (!best || best.score < 0.6) {
    return suggestion ? { kind: "unknown", heard, suggestion, near: [] } : { kind: "empty" };
  }
  const rivals = scored.filter((item) => item.score >= 0.85);
  if (rivals.length === 1 && best.score >= 0.86) {
    return { kind: "unique", tag: best.tag, score: best.score, heard };
  }
  const near = scored.filter((item) => item.score >= 0.6).slice(0, 4);
  // A one-digit miss is a guess. Offer the heard tag as a new animal, with the neighbor beside it.
  if (best.score < 0.85 && suggestion) {
    return { kind: "unknown", heard, suggestion, near };
  }
  // Once a phrase clearly fits, only the close rivals are tappable. A one-edit
  // neighbor (101 beside 102) stays out of that list.
  const candidates = (rivals.length > 0 ? rivals : near).slice(0, 4);
  return { kind: "ambiguous", heard, candidates };
}

function suggestionFor(heard: string, codes: string[], tags: ParsedTag[]): string {
  const withDigits = codes.find((code) => /\d/.test(code));
  if (withDigits && !tags.some((tag) => tag.code === withDigits)) return formatTagSuggestion(withDigits);
  const words = preprocess(heard).split(" ").filter((word) => word && !FILLER.has(word) && word !== "a");
  if (words.length === 1 && (words[0]?.length ?? 0) >= 4) {
    const name = (words[0] ?? "").toUpperCase();
    if (!tags.some((tag) => tag.code === name)) return name;
  }
  return "";
}

/** Low confidence unique hits become a one-tap confirm instead of an auto-count. */
export function applyConfidence(
  match: VoiceMatch,
  confidence: number | null,
  source: ConfidenceSource,
): VoiceMatch {
  if (match.kind !== "unique" || confidence == null) return match;
  const floor = source === "grammar" ? 0.2 : 0.75;
  if (confidence >= floor) return match;
  return {
    kind: "ambiguous",
    heard: match.heard,
    candidates: [{ tag: match.tag, score: match.score }],
  };
}
