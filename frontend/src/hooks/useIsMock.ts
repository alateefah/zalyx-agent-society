import { useState, useEffect } from "react";
import { fetchHealth } from "../utils/api";

/** Fetches health once on mount and returns whether runtime storage is local. */
export function useIsMock(): boolean | null {
  const [isMock, setIsMock] = useState<boolean | null>(null);
  useEffect(() => {
    fetchHealth()
      .then(({ localMode }) => setIsMock(localMode))
      .catch(() => setIsMock(null));
  }, []);
  return isMock;
}
