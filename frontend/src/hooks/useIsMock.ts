import { useState, useEffect } from "react";
import { fetchHealth } from "../utils/api";

/** Fetches health once on mount and returns the mock-mode flag. */
export function useIsMock(): boolean | null {
  const [isMock, setIsMock] = useState<boolean | null>(null);
  useEffect(() => {
    fetchHealth()
      .then(({ mockMode }) => setIsMock(mockMode))
      .catch(() => setIsMock(true));
  }, []);
  return isMock;
}
