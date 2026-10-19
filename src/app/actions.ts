"use server";

import { revalidatePath } from "next/cache";

// Call from client code after a change made through an API route (for example,
// finishing the interview), so pages the browser cached earlier aren't shown stale.
export async function refreshPages() {
  revalidatePath("/", "layout");
}
