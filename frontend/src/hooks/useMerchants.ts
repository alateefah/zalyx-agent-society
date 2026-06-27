import { useState, useEffect, useCallback } from "react";
import { DEMO_MERCHANTS } from "../utils/constants";
import { fetchMerchants, fetchHealth } from "../utils/api";
import type { ZalyxMerchantSnapshot } from "../types";

const DEFAULT_MERCHANT = DEMO_MERCHANTS.restaurant;

export function useMerchants() {
  const [merchants, setMerchants] = useState<ZalyxMerchantSnapshot[]>(
    Object.values(DEMO_MERCHANTS)
  );
  const [selectedMerchant, setSelectedMerchant] = useState<ZalyxMerchantSnapshot>(DEFAULT_MERCHANT);
  const [isMock, setIsMock] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(({ mockMode }) => setIsMock(mockMode))
      .catch(() => {});

    fetchMerchants()
      .then((list) => {
        if (list.length > 0) setMerchants(list);
      })
      .catch(() => {});
  }, []);

  const selectMerchant = useCallback((merchant: ZalyxMerchantSnapshot) => {
    setSelectedMerchant(merchant);
  }, []);

  const addMerchant = useCallback((merchant: ZalyxMerchantSnapshot) => {
    setMerchants((prev) =>
      prev.find((m) => m.id === merchant.id) ? prev : [...prev, merchant]
    );
    setSelectedMerchant(merchant);
  }, []);

  const refreshIsMock = useCallback(() => {
    fetchHealth()
      .then(({ mockMode }) => setIsMock(mockMode))
      .catch(() => undefined);
  }, []);

  return { merchants, selectedMerchant, isMock, selectMerchant, addMerchant, refreshIsMock };
}
