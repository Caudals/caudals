import { getBetterAuth } from "@/lib/auth/better-auth";
import { NextResponse } from "next/server";

function copySetCookieHeaders(from: Response, to: NextResponse) {
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      to.headers.append(key, value);
    }
  });
}

export async function POST(request: Request) {
  const authUrl = new URL("/api/auth/sign-out", request.url);
  const authResponse = await getBetterAuth().handler(
    new Request(authUrl, {
      method: "POST",
      headers: request.headers,
    })
  );

  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });

  copySetCookieHeaders(authResponse, response);

  return response;
}

export const GET = POST;
