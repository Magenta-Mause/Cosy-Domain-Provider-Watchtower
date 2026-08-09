import { z } from "zod";

/**
 * Deliberately excludes UNREACHABLE: that is a fact about the HTTP exchange, which the
 * runner owns, not a judgement about content. Offering it to the model produced rows
 * saying `reachable: true, category: UNREACHABLE`, and made an all-404 host come back
 * BENIGN one run and UNREACHABLE the next. EMPTY is the category for "answered, but
 * there is nothing there".
 */
export const WatchtowerCategory = z.enum([
  "COSY_FRONTEND",
  "BENIGN",
  "EMPTY",
  "SUSPICIOUS",
  "MALICIOUS",
]);

export const WatchtowerRiskLevel = z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]);

export const Verdict = z.object({
  category: WatchtowerCategory.describe(
    "COSY_FRONTEND when the site is a COSY game-hosting frontend; BENIGN for any other " +
      "legitimate use with actual content; EMPTY when the host answers but hosts nothing " +
      "(404 everywhere, a parking page, a default server placeholder); SUSPICIOUS when " +
      "something warrants a human look but is not conclusive; MALICIOUS for clear scam, " +
      "phishing, fake shop or malware distribution",
  ),
  riskLevel: WatchtowerRiskLevel.describe(
    "How much this content threatens the reputation of the parent domain",
  ),
  summary: z
    .string()
    .max(2000)
    .describe(
      "One or two sentences in German describing what the site does and why it was rated this way",
    ),
  visitedPaths: z.array(z.string()).describe("Every path opened, in visit order"),
});

export type Verdict = z.infer<typeof Verdict>;

/**
 * The Agent SDK validates against JSON Schema draft-07, while Zod emits 2020-12 by
 * default — without the target the run fails at startup on schema validation.
 */
export const verdictJsonSchema = z.toJSONSchema(Verdict, { target: "draft-7" });
