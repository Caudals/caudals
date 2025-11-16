"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";

interface LocaleDebugInfo {
  cookieLocale: string | null;
  localStorageLocale: string | null;
  navigatorLanguage: string | null;
  navigatorLanguages: string[];
  detectedCountry: string | null;
  currentLocale: Locale;
}

/**
 * Debug component to show locale detection information
 * Only visible in development mode
 * Add to your app with: <LocaleDebug />
 */
export function LocaleDebug({ currentLocale }: { currentLocale: Locale }) {
  const [debugInfo, setDebugInfo] = useState<LocaleDebugInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    async function gatherDebugInfo() {
      // Get cookie
      let cookieLocale: string | null = null;
      if (typeof document !== "undefined") {
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split("=");
          if (name === LOCALE_COOKIE) {
            cookieLocale = value;
            break;
          }
        }
      }

      // Get localStorage
      let localStorageLocale: string | null = null;
      if (typeof localStorage !== "undefined") {
        try {
          localStorageLocale = localStorage.getItem("caudals_locale");
        } catch (e) {
          // Ignore
        }
      }

      // Get navigator info
      const navigatorLanguage = navigator.language || null;
      const navigatorLanguages = Array.from(navigator.languages || []);

      // Get detected country
      let detectedCountry: string | null = null;
      if (typeof localStorage !== "undefined") {
        try {
          const cached = localStorage.getItem("caudals_country");
          if (cached) {
            const parsed = JSON.parse(cached);
            detectedCountry = parsed.country;
          }
        } catch (e) {
          // Ignore
        }
      }

      setDebugInfo({
        cookieLocale,
        localStorageLocale,
        navigatorLanguage,
        navigatorLanguages,
        detectedCountry,
        currentLocale,
      });
    }

    gatherDebugInfo();
  }, [currentLocale]);

  // Only show in development
  if (process.env.NODE_ENV !== "development" || !debugInfo) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
      }}
    >
      {!isVisible ? (
        <button
          onClick={() => setIsVisible(true)}
          style={{
            background: "#3b82f6",
            color: "white",
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          🌍 i18n Debug
        </button>
      ) : (
        <div
          style={{
            background: "white",
            border: "2px solid #3b82f6",
            borderRadius: "8px",
            padding: "16px",
            minWidth: "300px",
            maxWidth: "400px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            fontSize: "12px",
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              paddingBottom: "12px",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <strong style={{ fontSize: "14px" }}>🌍 Locale Debug Info</strong>
            <button
              onClick={() => setIsVisible(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <strong style={{ color: "#3b82f6" }}>Current Locale:</strong>{" "}
              <span style={{ color: "#10b981", fontWeight: "bold" }}>
                {debugInfo.currentLocale}
              </span>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
              <strong>Cookie:</strong>{" "}
              {debugInfo.cookieLocale || (
                <span style={{ color: "#ef4444" }}>not set</span>
              )}
            </div>

            <div>
              <strong>LocalStorage:</strong>{" "}
              {debugInfo.localStorageLocale || (
                <span style={{ color: "#ef4444" }}>not set</span>
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
              <strong>Detected Country:</strong>{" "}
              {debugInfo.detectedCountry || (
                <span style={{ color: "#ef4444" }}>not detected</span>
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
              <strong>Navigator Language:</strong>{" "}
              {debugInfo.navigatorLanguage || "unknown"}
            </div>

            <div>
              <strong>Navigator Languages:</strong>
              <div
                style={{
                  marginLeft: "12px",
                  marginTop: "4px",
                  color: "#6b7280",
                }}
              >
                {debugInfo.navigatorLanguages.length > 0
                  ? debugInfo.navigatorLanguages.join(", ")
                  : "none"}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "12px",
              paddingTop: "12px",
              borderTop: "1px solid #e5e7eb",
              color: "#6b7280",
              fontSize: "10px",
            }}
          >
            Check browser console for detailed i18n logs
          </div>
        </div>
      )}
    </div>
  );
}

