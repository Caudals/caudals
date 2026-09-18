"use client";
import { useEffect, useState } from "react";
import { evaluationReturnPath } from "./auth-path";
export function useAuthDestination(next?: string) {
  // Query next is a non-secret fallback only. Secret-bearing next is read solely
  // from location.hash after hydration, never from server props or storage.
  const [destination, setDestination] = useState(
    () => evaluationReturnPath(next).split("#")[0],
  );
  useEffect(() => {
    const consume = () => {
      if (!window.location.hash) return;
      const params = new URLSearchParams(window.location.hash.slice(1));
      const value = params.get("next");
      if (value) setDestination(evaluationReturnPath(value));
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
  }, []);
  return destination;
}
