import { useState, useCallback } from "react";
import { streamUnderwriting, fetchBaseline } from "../utils/api";
import type { ZalyxMerchantSnapshot, UnderwritingReport, BaselineReport, AgentDebateMessage } from "../types";

type View = "form" | "processing" | "report";

export function useUnderwriting() {
  const [view, setView] = useState<View>("form");
  const [report, setReport] = useState<UnderwritingReport | null>(null);
  const [baseline, setBaseline] = useState<BaselineReport | null>(null);
  const [processingLabel, setProcessingLabel] = useState("Starting…");
  const [liveMessages, setLiveMessages] = useState<AgentDebateMessage[]>([]);
  const [error, setError] = useState("");

  const run = async (snapshot: ZalyxMerchantSnapshot) => {
    setError("");
    setBaseline(null);
    setReport(null);
    setLiveMessages([]);
    setProcessingLabel("Starting agents…");
    setView("processing");

    try {
      const baselinePromise = fetchBaseline(snapshot);

      const finalReport = await streamUnderwriting(snapshot, (evt) => {
        if (evt.type === "stage_start")    setProcessingLabel(`${evt.agentName}…`);
        if (evt.type === "stage_complete") {
          setLiveMessages((prev) => [...prev, evt.debateMessage]);
          setProcessingLabel(`${evt.agentName} done`);
        }
        if (evt.type === "debate_start")   setProcessingLabel("Debate round 2…");
      });

      const bd = await baselinePromise;
      setBaseline(bd);
      setReport(finalReport);
      setView("report");

      return finalReport;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      setView("form");
      return null;
    }
  };

  const loadPreviousReport = useCallback(
    (previousReport: UnderwritingReport, previousBaseline?: BaselineReport) => {
      setReport(previousReport);
      setBaseline(previousBaseline ?? null);
      setLiveMessages(previousReport.debateTranscript ?? []);
      setView("report");
    },
    []
  );

  const reset = useCallback(() => {
    setView("form");
    setReport(null);
    setBaseline(null);
    setLiveMessages([]);
    setError("");
  }, []);

  return {
    view,
    report,
    baseline,
    processingLabel,
    liveMessages,
    error,
    run,
    loadPreviousReport,
    reset,
  };
}
