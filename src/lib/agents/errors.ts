import Anthropic from "@anthropic-ai/sdk";

// Turns an agent failure into an HTTP status and a message that says what kind
// of problem it was, so setup mistakes (like a missing API key) are easy to spot.
export function describeAgentError(error: unknown, who: string) {
  const missingKey =
    error instanceof Error && /could not resolve authentication method/i.test(error.message);
  if (
    missingKey ||
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return {
      status: 500,
      message: `${who} isn't set up correctly: the server's Anthropic API key is missing or invalid.`,
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: `${who} is getting too many requests. Wait a few seconds and press Retry.` };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 504, message: `${who} took too long to respond. Press Retry.` };
  }
  if (error instanceof Anthropic.APIError && error.status === 400 && /credit|billing/i.test(error.message)) {
    return { status: 402, message: `${who} is unavailable: the Anthropic account is out of credit.` };
  }
  return { status: 502, message: `${who} couldn't reply just now. Press Retry.` };
}
