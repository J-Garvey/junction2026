import { useEffect, useRef } from "react";
import { api } from "./api";
import { MessagePreparation } from "./messagePreparation";

/** Reuse server caches, never a draft's dates, selected products or supplier terms. */
export function useMessagePreparation(text: string) {
  const preparation = useRef<MessagePreparation | null>(null);
  useEffect(() => {
    const current = new MessagePreparation(api.prepareMessage);
    preparation.current = current;
    return () => current.dispose();
  }, []);
  useEffect(() => { preparation.current?.update(text); }, [text]);
}
