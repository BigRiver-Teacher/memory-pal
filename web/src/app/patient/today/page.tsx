"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const MEAL_TIMES = [
  { label: "早餐", minutes: 8 * 60 },
  { label: "午餐", minutes: 12 * 60 },
  { label: "晚餐", minutes: 18 * 60 },
];

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getMealReminder(date: Date): string {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const nextMeal = MEAL_TIMES.find(
    (meal) => currentMinutes < meal.minutes,
  );

  if (!nextMeal) {
    return "今天的饭都吃过了，早点休息";
  }

  const remainingMinutes = nextMeal.minutes - currentMinutes;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return `距离${nextMeal.label}还有 ${hours} 小时 ${minutes} 分钟`;
}

export default function PatientTodayPage() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-8 sm:px-8">
        <section className="rounded-[32px] border border-[#dfd6c8] bg-[#fffdf8] px-6 py-10 text-center shadow-sm sm:px-10">
          <p className="text-xl font-semibold text-[#7a6f61]">
            今天是
          </p>
          <h1
            suppressHydrationWarning
            className="mt-4 text-4xl font-bold leading-tight text-[#205c4b] sm:text-5xl"
          >
            {formatDate(now)}
          </h1>
          <p
            suppressHydrationWarning
            className="mt-8 text-6xl font-bold tracking-wider text-[#2d2924] sm:text-7xl"
          >
            {formatTime(now)}
          </p>
        </section>

        <section className="rounded-[32px] border border-[#d7e5dc] bg-[#eef7f2] px-6 py-10 text-center shadow-sm sm:px-10">
          <p className="text-xl font-semibold text-[#4f8f78]">
            下一顿饭
          </p>
          <p className="mt-5 text-3xl font-bold leading-tight text-[#205c4b] sm:text-4xl">
            {getMealReminder(now)}
          </p>
        </section>

        <Link
          href="/patient"
          className="flex min-h-16 items-center justify-center rounded-2xl bg-[#205c4b] px-8 text-xl font-bold text-white shadow-lg transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35"
        >
          返回对话
        </Link>
      </div>
    </main>
  );
}