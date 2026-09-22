"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const MEAL_TIMES = [
  { label: "早餐", minutes: 8 * 60 },
  { label: "午餐", minutes: 12 * 60 },
  { label: "晚餐", minutes: 18 * 60 },
];

type MemoryRow = {
  id: string;
  content: string;
};

function formatDate(date: Date): string {
  const monthAndDay = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(date);

  return `${monthAndDay} ${weekday}`;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getGreeting(date: Date): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 11) {
    return "早上好，今天感觉怎么样";
  }

  if (hour >= 11 && hour < 14) {
    return "中午好，记得好好吃饭";
  }

  if (hour >= 14 && hour < 18) {
    return "下午好，今天过得还顺利吗";
  }

  if (hour >= 18 && hour < 22) {
    return "晚上好，今天辛苦了";
  }

  return "夜深了，早点休息";
}

function getMealReminder(date: Date): string {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const nextMeal = MEAL_TIMES.find(
    (meal) => currentMinutes < meal.minutes,
  );

  if (!nextMeal) {
    return "今天的饭都吃过了，好好休息";
  }

  if (nextMeal.label === "早餐") {
    return "早餐时间快到了，记得吃点东西";
  }

  if (nextMeal.label === "午餐") {
    return "午餐时间快到了，记得吃饭";
  }

  return "晚餐时间快到了，记得吃饭";
}

export default function PatientTodayPage() {
  const [now, setNow] = useState(() => new Date());
  const [memoryTip, setMemoryTip] = useState<string | null>(null);
  const [isMemoryLoading, setIsMemoryLoading] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadMemoryTip() {
      const patientId =
        window.localStorage.getItem("current_patient_id");

      if (!patientId) {
        setIsMemoryLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/memory?patientId=${encodeURIComponent(patientId)}`,
        );

        if (!response.ok) {
          throw new Error("Memory list request failed");
        }

        const data = (await response.json()) as {
          memories?: MemoryRow[];
        };
        const memories = data.memories ?? [];

        if (isActive && memories.length > 0) {
          const memory =
            memories[Math.floor(Math.random() * memories.length)];
          setMemoryTip(memory.content);
        }
      } catch {
        if (isActive) {
          setMemoryTip(null);
        }
      } finally {
        if (isActive) {
          setIsMemoryLoading(false);
        }
      }
    }

    void loadMemoryTip();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#205c4b]">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-8 sm:px-8">
        <section className="rounded-[32px] border border-[#dfd6c8] bg-white px-6 py-10 text-center shadow-[0_16px_40px_rgba(72,58,42,0.10)] sm:px-10">
          <h1
            suppressHydrationWarning
            className="text-6xl font-bold leading-tight text-[#205c4b] sm:text-7xl"
          >
            {formatDate(now)}
          </h1>
          <p
            suppressHydrationWarning
            className="mt-6 text-5xl font-semibold tracking-wider text-[#4f8f78] sm:text-6xl"
          >
            {formatTime(now)}
          </p>
          <p
            suppressHydrationWarning
            className="mt-8 text-2xl font-bold leading-9 text-[#2d2924] sm:text-3xl"
          >
            {getGreeting(now)}
          </p>
        </section>

        <section className="rounded-[32px] border border-[#d7e5dc] bg-white px-6 py-8 text-center shadow-[0_12px_32px_rgba(72,58,42,0.08)] sm:px-10">
          <p className="text-lg font-semibold text-[#4f8f78]">
            下一顿饭
          </p>
          <p className="mt-4 text-3xl font-bold leading-tight text-[#205c4b] sm:text-4xl">
            {getMealReminder(now)}
          </p>
        </section>

        <section className="rounded-[32px] border border-[#e4dbcf] bg-white px-6 py-8 shadow-[0_12px_32px_rgba(72,58,42,0.08)] sm:px-10">
          <p className="text-lg font-semibold text-[#9c6b3f]">
            今天的小提示
          </p>
          <p className="mt-4 text-2xl font-bold leading-10 text-[#2d2924] sm:text-3xl">
            {isMemoryLoading
              ? "正在寻找一段温暖的记忆..."
              : memoryTip || "今天还没有小提示"}
          </p>
        </section>

        <Link
          href="/patient"
          className="flex min-h-20 items-center justify-center rounded-2xl bg-[#205c4b] px-8 text-2xl font-bold text-white shadow-lg transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35"
        >
          返回对话
        </Link>
      </div>
    </main>
  );
}