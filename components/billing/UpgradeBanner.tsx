import Link from "next/link";
import { RiVipCrownLine } from "react-icons/ri";

export default function UpgradeBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <RiVipCrownLine size={16} />
        </span>
        <p className="text-sm text-base-content/80 truncate">{message}</p>
      </div>
      <Link href="/pricing" className="btn btn-primary btn-sm shrink-0">
        Upgrade
      </Link>
    </div>
  );
}
