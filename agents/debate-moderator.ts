/**
 * Debate Moderator
 *
 * Deterministic resolver that reads the agent debate transcript and produces
 * a structured DebateLedger — a typed record of every disputed claim, the
 * evidence from each side, and how each claim was resolved.
 *
 * Design choice: this is NOT an LLM call. The orchestrator already has all the
 * agent outputs in structured form. Using a deterministic extractor over parsed
 * transcript text demonstrates that the agent society produces outputs that are
 * themselves machine-readable and auditable — not just chat logs.
 *
 * Resolution logic:
 *   - Parse the Risk Agent's challenge into discrete claims (split on sentence boundaries)
 *   - Match each claim against the Business Agent's rebuttal to find counter-evidence
 *   - Read the Risk Agent's final verdict to determine resolution type per claim
 *   - Produce one DebateClaim per substantive dispute
 */

import {
  AgentDebateMessage,
  DebateClaim,
  DebateLedger,
  RiskAssessmentResult,
  BusinessAnalysisResult,
} from "../utils/types";

// Keywords that signal a Risk Agent concern
const RISK_SIGNAL_PHRASES = [
  "concern", "flag", "risk", "issue", "question", "unusual", "anomal",
  "low", "high", "missing", "volatile", "outstanding", "uncollected",
  "inactive", "backdate", "edit rate", "delete rate", "concentration",
];

// Keywords that signal concession in Risk Agent's verdict
const CONCESSION_PHRASES = [
  "concede", "accept", "revise", "acknowledge", "lower", "reduce",
  "agree", "valid point", "fair", "context", "makes sense", "correct",
];

// Keywords that signal upheld concern
const UPHELD_PHRASES = [
  "maintain", "hold firm", "still concern", "remain", "persist",
  "nonetheless", "however", "despite", "covenant", "condition required",
];

function splitIntoClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .filter((s) =>
      RISK_SIGNAL_PHRASES.some((kw) => s.toLowerCase().includes(kw))
    )
    .slice(0, 5); // cap at 5 claims per debate
}

function extractEvidence(text: string, claim: string): string[] {
  // Find sentences in `text` that are topically related to `claim`
  const claimWords = new Set(
    claim.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  );
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15)
    .filter((s) => {
      const words = s.toLowerCase().split(/\W+/);
      const overlap = words.filter((w) => claimWords.has(w)).length;
      return overlap >= 1;
    })
    .slice(0, 2);
}

function resolveClaimType(
  claim: string,
  verdictText: string
): DebateClaim["resolution"] {
  const claimLower = claim.toLowerCase();
  const verdictLower = verdictText.toLowerCase();

  // Find the sentence in the verdict most related to this claim
  const claimWords = new Set(claimLower.split(/\W+/).filter((w) => w.length > 4));
  const relevantVerdictSentences = verdictText
    .split(/(?<=[.!?])\s+/)
    .filter((s) => {
      const words = s.toLowerCase().split(/\W+/);
      return words.some((w) => claimWords.has(w));
    })
    .join(" ")
    .toLowerCase();

  const context = relevantVerdictSentences || verdictLower;

  if (CONCESSION_PHRASES.some((p) => context.includes(p))) {
    if (context.includes("condition") || context.includes("covenant")) {
      return "compromise_condition_set";
    }
    if (context.includes("sector") || context.includes("normal") || context.includes("seasonal")) {
      return "reframed_as_sector_normal";
    }
    return "claim_withdrawn";
  }

  if (UPHELD_PHRASES.some((p) => context.includes(p))) {
    return "risk_concern_upheld";
  }

  // Default: if verdict mentions a condition related to this claim
  if (context.includes("condition") || context.includes("before disbursal")) {
    return "compromise_condition_set";
  }

  return "unresolved";
}

function claimImpact(
  resolution: DebateClaim["resolution"],
  claim: string,
  humanDecision: string
): string {
  switch (resolution) {
    case "reframed_as_sector_normal":
      return `Risk weight for this concern was reduced after sector context was accepted. Did not block approval.`;
    case "claim_withdrawn":
      return `Risk Agent withdrew this concern after rebuttal. Removed from final risk score considerations.`;
    case "compromise_condition_set":
      return `Resolved with a disbursement condition rather than rejection. Merchant must satisfy condition before asset purchase.`;
    case "risk_concern_upheld":
      return `Concern carried into final decision. Contributed to ${humanDecision === "rejected" ? "rejection" : "heightened conditions"}.`;
    case "unresolved":
      return `No clear resolution reached. Human Review Agent used its discretion on this point.`;
  }
}

export class DebateModerator {
  /**
   * Build a DebateLedger from the debate transcript produced by the orchestrator.
   * Only meaningful when the debate round actually fired.
   */
  buildLedger(
    transcript: AgentDebateMessage[],
    businessAnalysis: BusinessAnalysisResult,
    riskAssessment: RiskAssessmentResult,
    humanDecision: string,
    debateFired: boolean
  ): DebateLedger | undefined {
    if (!debateFired) return undefined;

    // Find the key messages
    const riskChallenge = transcript.find(
      (m) => m.agentName === "Risk Assessment Agent" && m.messageType === "challenge"
    );
    const businessRebuttal = transcript.find(
      (m) => m.agentName === "Business Analysis Agent" && m.messageType === "rebuttal"
    );
    const riskVerdict = transcript.find(
      (m) => m.agentName === "Risk Assessment Agent" && m.messageType === "verdict"
    );

    if (!riskChallenge || !businessRebuttal || !riskVerdict) {
      // Fallback: use any challenge/rebuttal/verdict messages
      const challenge = transcript.find((m) => m.messageType === "challenge");
      const rebuttal = transcript.find((m) => m.messageType === "rebuttal");
      const verdict = transcript.find((m) => m.messageType === "verdict");
      if (!challenge || !rebuttal || !verdict) return undefined;
    }

    const challengeText = riskChallenge?.message ?? "";
    const rebuttalText = businessRebuttal?.message ?? "";
    const verdictText = riskVerdict?.message ?? "";

    // Extract discrete claims from the Risk Agent's challenge
    const rawClaims = splitIntoClaims(challengeText);

    // If extraction found no discrete claims, use the whole challenge as one claim
    const claimTexts =
      rawClaims.length > 0
        ? rawClaims
        : [challengeText.slice(0, 300)];

    const claims: DebateClaim[] = claimTexts.map((claimText, i) => {
      const resolution = resolveClaimType(claimText, verdictText);
      const evidenceFor = extractEvidence(challengeText, claimText);
      const evidenceAgainst = extractEvidence(rebuttalText, claimText);

      // Ensure at least one piece of evidence each side
      if (evidenceFor.length === 0) evidenceFor.push(claimText.slice(0, 150));
      if (evidenceAgainst.length === 0 && rebuttalText.length > 0) {
        evidenceAgainst.push(rebuttalText.slice(0, 150));
      }

      return {
        claimId: `risk-${String(i + 1).padStart(3, "0")}`,
        claim: claimText,
        raisedBy: "Risk Assessment Agent",
        challengedAgent: "Business Analysis Agent",
        evidenceFor,
        evidenceAgainst,
        resolution,
        impact: claimImpact(resolution, claimText, humanDecision),
      };
    });

    const resolvedClaims = claims.filter(
      (c) => c.resolution !== "unresolved"
    ).length;
    const claimsUphelByRisk = claims.filter(
      (c) => c.resolution === "risk_concern_upheld"
    ).length;
    const claimsConcededByRisk = claims.filter(
      (c) =>
        c.resolution === "claim_withdrawn" ||
        c.resolution === "reframed_as_sector_normal"
    ).length;
    const compromises = claims.filter(
      (c) => c.resolution === "compromise_condition_set"
    ).length;

    const negotiationSummary =
      `The debate round resolved ${resolvedClaims} of ${claims.length} disputed claim(s). ` +
      (claimsConcededByRisk > 0
        ? `The Risk Agent conceded or reframed ${claimsConcededByRisk} concern(s) after the Business Agent's rebuttal. `
        : "") +
      (claimsUphelByRisk > 0
        ? `${claimsUphelByRisk} concern(s) were upheld and carried into the final decision. `
        : "") +
      (compromises > 0
        ? `${compromises} point(s) were resolved via disbursement conditions rather than outright rejection. `
        : "") +
      `Final decision: ${humanDecision.toUpperCase()} (health score: ${businessAnalysis.businessHealthScore}/100, risk score: ${riskAssessment.overallRiskScore}/100).`;

    return {
      totalClaims: claims.length,
      resolvedClaims,
      claimsUphelByRisk,
      claimsConcededByRisk,
      claims,
      negotiationSummary,
    };
  }
}

export const debateModerator = new DebateModerator();
