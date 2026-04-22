import { redirect } from "next/navigation";

// Middleware handles locale redirect; this is a safety fallback
export default function RootPage() {
  redirect("/en");
}
