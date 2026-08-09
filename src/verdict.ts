import { z } from "zod";

export const WatchtowerCategory = z.enum([
  "COSY_FRONTEND",
  "BENIGN",
  "SUSPICIOUS",
  "MALICIOUS",
  "UNREACHABLE",
]);

export const WatchtowerRiskLevel = z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]);

export const Verdict = z.object({
  category: WatchtowerCategory.describe(
    "COSY_FRONTEND when the site is a COSY game-hosting frontend; BENIGN for any other " +
      "legitimate use; SUSPICIOUS when something warrants a human look but is not conclusive; " +
      "MALICIOUS for clear scam, phishing, fake shop or malware distribution",
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
