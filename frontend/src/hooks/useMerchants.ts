import { useState, useEffect, useCallback } from "react";
import { fetchMerchants, fetchHealth } from "../utils/api";
import type { ZalyxMerchantSnapshot } from "../types";

export function useMerchants() {
  const [merchants, setMerchants] = useState<ZalyxMerchantSnapshot[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<ZalyxMerchantSnapshot | null>(null);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(true);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(({ localMode }) => setIsMock(localMode))
      .catch(() => {});

    fetchMerchants()
      .then((list) => {
        setMerchantsError(null);
        setMerchants(list);
      })
      .catch((err: unknown) => {
        setMerchantsError(err instanceof Error ? err.message : "Failed to load merchants");
        setMerchants([]);
      })
      .finally(() => setIsLoadingMerchants(false));
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
      .then(({ localMode }) => setIsMock(localMode))
      .catch(() => undefined);
  }, []);

  return {
    merchants,
    selectedMerchant,
    isMock,
    isLoadingMerchants,
    merchantsError,
    selectMerchant,
    addMerchant,
    refreshIsMock,
  };
}
