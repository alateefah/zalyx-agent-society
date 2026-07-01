// Wrapper so React Router remounts MerchantWorkspace cleanly when merchantId changes.
import { useParams } from "react-router-dom";
import { MerchantWorkspace } from "./MerchantWorkspace";

export function MerchantWorkspacePage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  return <MerchantWorkspace key={merchantId} />;
}
