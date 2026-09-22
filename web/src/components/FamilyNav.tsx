"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/family",
    label: "记忆",
    icon: "忆",
  },
  {
    href: "/family/report",
    label: "日报",
    icon: "报",
  },
  {
    href: "/family/settings",
    label: "设置",
    icon: "设",
  },
];

export default function FamilyNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="家属端导航"
      className="sticky bottom-0 z-40 mt-auto shrink-0 border-t border-[#d8cfc2] bg-[#fffdf8]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(72,58,42,0.10)] backdrop-blur"
    >
      <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/family"
              ? pathname === "/family"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl px-3 text-lg font-bold transition focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/25 ${
                isActive
                  ? "bg-[#e8f3ee] text-[#205c4b]"
                  : "text-[#7a6f61] hover:bg-[#f5f0e8] hover:text-[#205c4b]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mb-1 flex h-8 w-8 items-center justify-center rounded-full text-base ${
                  isActive
                    ? "bg-[#205c4b] text-white"
                    : "bg-[#e8e0d5] text-[#6f6457]"
                }`}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}