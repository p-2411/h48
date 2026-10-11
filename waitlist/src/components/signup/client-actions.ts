import { joinWaitlist, saveDetails, type DetailsState, type JoinState } from "@/lib/waitlist/actions";

/**
 * Client-side wrappers for the server actions. A rejected action (offline, a
 * dropped connection, or "Server Action not found" after a deploy) would
 * otherwise be rethrown by useActionState and replace the whole page with the
 * error boundary. Here it becomes an ordinary error message under the form.
 */

/** What to say when the request never got an answer. */
export function connectionError(): string {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline
    ? "You're offline. Check your connection, then try again."
    : "We couldn't reach our server. Refresh the page, then try again.";
}

export async function joinFromClient(previous: JoinState, formData: FormData): Promise<JoinState> {
  try {
    return await joinWaitlist(previous, formData);
  } catch {
    const email = formData.get("email");
    return { status: "error", message: connectionError(), email: typeof email === "string" ? email : "" };
  }
}

export async function saveDetailsFromClient(previous: DetailsState, formData: FormData): Promise<DetailsState> {
  try {
    return await saveDetails(previous, formData);
  } catch {
    return { status: "error", message: connectionError() };
  }
}
