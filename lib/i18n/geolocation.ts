/**
 * Geolocation service to detect country from IP address
 * Works in self-hosted environments (Dokploy) without platform-specific headers
 */

const SPAIN_COUNTRY_CODES = new Set(["ES", "ESP", "Spain"]);

interface GeolocationResponse {
  country_code?: string;
  country?: string;
  countryCode?: string;
  // Different APIs return different formats
}

/**
 * Get country code from IP address using multiple fallback services
 * This ensures it works even in self-hosted environments
 */
export async function getCountryFromIP(ip?: string): Promise<string | null> {
  // If no IP provided, can't detect
  if (!ip) return null;
  
  // Skip local/private IPs
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.") ||
    ip === "localhost"
  ) {
    return null;
  }

  try {
    // Try ipapi.co first (free, no API key needed, 30k requests/month)
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });

    if (response.ok) {
      const data = (await response.json()) as GeolocationResponse;
      const countryCode =
        data.country_code || data.countryCode || data.country;
      if (countryCode) {
        return countryCode.toUpperCase();
      }
    }
  } catch (error) {
    // If ipapi.co fails, try fallback service
    console.debug("IP geolocation failed:", error);
    
    try {
      // Fallback to ip-api.com (free, no API key, 45 requests/minute)
      const fallbackResponse = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(2000),
      });

      if (fallbackResponse.ok) {
        const fallbackData = (await fallbackResponse.json()) as GeolocationResponse;
        const countryCode = fallbackData.countryCode || fallbackData.country_code;
        if (countryCode) {
          return countryCode.toUpperCase();
        }
      }
    } catch (fallbackError) {
      console.debug("IP geolocation fallback also failed:", fallbackError);
    }
  }

  return null;
}

/**
 * Extract IP address from Next.js request
 */
export function getClientIP(headers: Headers): string | null {
  // Check multiple headers for IP (different proxies/load balancers)
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, get the first one
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-client-ip") ||
    headers.get("true-client-ip") ||
    null
  );
}

/**
 * Check if a country code is Spain
 */
export function isSpain(countryCode?: string | null): boolean {
  if (!countryCode) return false;
  const normalized = countryCode.trim().toUpperCase();
  return SPAIN_COUNTRY_CODES.has(normalized) || normalized === "ES";
}

