import { useEffect } from "react";
import { useRouter } from "next/router";

/** @deprecated Merged into /email?tab=health — keep route for bookmarks. */
export default function EmailHealthRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/email?tab=health");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-24">
      <span className="loading loading-spinner loading-sm text-base-content/40" />
    </div>
  );
}
