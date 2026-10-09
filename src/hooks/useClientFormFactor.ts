import { useEffect, useState } from "react";
import {
  applyClientFormFactorAttr,
  readClientFormFactor,
  subscribeClientFormFactor,
  type ClientFormFactor,
} from "../lib/client-form-factor";

/**
 * Form factor live (resize / rotate). Juga mengisi `document.documentElement.dataset.client`.
 */
export function useClientFormFactor(): ClientFormFactor {
  const [factor, setFactor] = useState<ClientFormFactor>(() => {
    const initial = readClientFormFactor();
    applyClientFormFactorAttr(initial);
    return initial;
  });

  useEffect(() => subscribeClientFormFactor(setFactor), []);

  return factor;
}

export function useIsPhoneClient(): boolean {
  return useClientFormFactor() === "phone";
}
