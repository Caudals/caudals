import { Resend } from "resend";

let resendClient: Resend | null = null;

type ClientOptions = {
  apiKey?: string;
};

export function getResendClient(options: ClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}
