"use client";

import { useEffect, useState } from "react";

export function useWebGLSupport() {
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

      setIsSupported(Boolean(context));
    } catch {
      setIsSupported(false);
    }
  }, []);

  return isSupported;
}
