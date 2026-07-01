// Wrapper so React Router remounts DecisionReport cleanly when requestId changes.
import { useParams } from "react-router-dom";
import { DecisionReport } from "./DecisionReport";

export function DecisionReportPage() {
  const { merchantId, requestId } = useParams<{ merchantId: string; requestId: string }>();
  return <DecisionReport key={`${merchantId}/${requestId}`} />;
}
