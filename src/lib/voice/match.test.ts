import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHerdCsv } from "../csv";
import {
  applyConfidence,
  codePrefixes,
  grammarPhrases,
  matchSpoken,
  primaryPhrase,
  spokenForms,
  tagKey,
} from "./match";

const csv = readFileSync(new URL("../../../public/herd-active.csv", import.meta.url), "utf8");
const parsed = parseHerdCsv(csv);
if (!parsed.ok) throw new Error(parsed.error);
const tags = parsed.rows.map((row) => row.tag);

function expectTag(phrase: string, tag: string, herd = tags) {
  const result = matchSpoken(phrase, herd);
  if (result.kind === "unique") {
    expect(result.tag, phrase).toBe(tag);
    return;
  }
  expect(result.kind, `${phrase} → ${JSON.stringify(result)}`).toBe("ambiguous");
  if (result.kind === "ambiguous") {
    expect(result.candidates.map((item) => item.tag), phrase).toContain(tag);
    expect(result.candidates[0]?.tag, phrase).toBe(tag);
  }
}

describe("ranch herd voice matching", () => {
  it("loads the bundled active herd", () => {
    expect(tags).toHaveLength(183);
    expect(new Set(tags.map(tagKey)).size).toBe(tags.length);
  });

  it("round-trips every tag through its primary spoken form", () => {
    for (const tag of tags) {
      const phrase = primaryPhrase(tag);
      const code = tagKey(tag);
      const properPrefix = tags.some(
        (other) => other !== tag && codePrefixes(other).includes(code) && tagKey(other) !== code,
      );
      const result = matchSpoken(phrase, tags);
      if (properPrefix) {
        expect(result.kind, `${tag} via "${phrase}"`).toBe("ambiguous");
        if (result.kind === "ambiguous") expect(result.candidates[0]?.tag).toBe(tag);
      } else {
        expect(result.kind, `${tag} via "${phrase}" → ${JSON.stringify(result)}`).toBe("unique");
        if (result.kind === "unique") expect(result.tag).toBe(tag);
      }
    }
  });

  it("treats a shared number as ambiguous and a full suffix as unique", () => {
    for (const phrase of ["one oh two", "one zero two", "one hundred two", "one hundred and two"]) {
      const result = matchSpoken(phrase, tags);
      expect(result.kind, phrase).toBe("ambiguous");
      if (result.kind === "ambiguous") {
        expect(result.candidates.map((item) => item.tag)).toEqual(["102", "102Y WU"]);
      }
    }
    expectTag("one oh two yellow double you you", "102Y WU");
    expectTag("one oh two why w u", "102Y WU");
    expectTag("one hundred and two yellow double u u", "102Y WU");
    expectTag("102Y WU", "102Y WU");
  });

  it("keeps leading zeros and bare digits apart", () => {
    expectTag("nine", "9");
    expectTag("oh nine", "09");
    expectTag("zero nine", "09");
    const nine = matchSpoken("nine", tags);
    expect(nine.kind === "unique" && nine.tag).toBe("9");
    const ohNine = matchSpoken("oh nine", tags);
    expect(ohNine.kind === "unique" && ohNine.tag).toBe("09");
  });

  it("matches letter suffixes, colors, and grouped numbers", () => {
    expectTag("twenty three", "23 X");
    expectTag("twenty three ex", "23 X");
    expectTag("two three x", "23 X");
    expectTag("one forty", "140");
    expectTag("one forty yellow", "140Y UW");
    expectTag("one four oh yellow u w", "140Y UW");
    expectTag("two oh three bee u w", "203B UW");
    expectTag("two hundred three blue", "203B UW");
    expectTag("four twenty green you double you", "420G UW");
    expectTag("four hundred twenty green", "420G UW");
    expectTag("four two oh gee you double you", "420G UW");
    expectTag("nineteen oh one", "1901");
    expectTag("one nine zero one", "1901");
    expectTag("one thousand nine hundred one", "1901");
    expectTag("one hundred ex", "100 X");
    expectTag("a hundred two", "102");
  });

  it("matches name tags and blue five r", () => {
    expectTag("notch", "NOTCH");
    expectTag("kermit", "KERMIT");
    expectTag("fiona", "Fiona");
    expectTag("blue five are", "BLUE 5R");
    expectTag("blue five red", "BLUE 5R");
    expectTag("blue 5 r", "BLUE 5R");
    expectTag("one hundred archie", "100 ARCHIE");
    expectTag("one oh oh archie", "100 ARCHIE");
    expectTag("archie", "100 ARCHIE");
  });

  it("offers to add a number that is not in the herd", () => {
    const near = matchSpoken("two oh five", tags);
    expect(near.kind).toBe("unknown");
    if (near.kind === "unknown") {
      expect(near.suggestion).toBe("205");
      expect(near.near.map((item) => item.tag)).toContain("105");
    }
    const fresh = matchSpoken("nine nine nine", tags);
    expect(fresh.kind).toBe("unknown");
    if (fresh.kind === "unknown") expect(fresh.suggestion).toBe("999");
    expect(matchSpoken("uh", tags).kind).toBe("empty");
    expect(matchSpoken("[unk]", tags).kind).toBe("empty");
  });

  it("does not let a short number swallow a longer tag", () => {
    const herd = ["014", "14", "140", "102"];
    expect(matchSpoken("zero one four", herd)).toMatchObject({ kind: "unique", tag: "014" });
    expect(matchSpoken("oh fourteen", herd)).toMatchObject({ kind: "unique", tag: "014" });
    expect(matchSpoken("fourteen", herd)).toMatchObject({ kind: "unique", tag: "14" });
    expect(matchSpoken("one", ["1", "16", "102"])).toMatchObject({ kind: "unique", tag: "1" });
  });

  it("downgrades a shaky free-form guess to a tap", () => {
    const unique = matchSpoken("twenty three ex", tags);
    expect(unique.kind).toBe("unique");
    const soft = applyConfidence(unique, 0.4, "free");
    expect(soft.kind).toBe("ambiguous");
    expect(applyConfidence(unique, 0.4, "grammar").kind).toBe("unique");
    expect(applyConfidence(unique, 0.9, "free").kind).toBe("unique");
  });

  it("builds a grammar that includes herd phrases and unknown numbers", () => {
    const phrases = grammarPhrases(tags);
    expect(phrases).toContain("[unk]");
    expect(phrases).toContain(primaryPhrase("102Y WU"));
    expect(phrases).toContain("two oh five");
    expect(phrases.length).toBeLessThan(5000);
    for (const tag of tags) {
      expect(spokenForms(tag).length).toBeGreaterThan(0);
    }
  });
});
