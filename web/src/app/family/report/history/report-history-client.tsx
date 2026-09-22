"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FamilyNav from "@/components/FamilyNav";

type ReportHistoryClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type PatientRow = {
  id: string;
  name: string;
};

type ReportHistoryItem = {
  date: string;
  questionCount: number;
  adviceSummary: string;
};

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export default function ReportHistoryClient({
  supabaseUrl,
  supabaseAnonKey,
}: ReportHistoryClientProps) {
  const router = useRouter();
  const [supabase] = useState(() =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  const [patientName, setPatientName] = useState("");
  const [items, setItems] = useState<ReportHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadHistory() {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (!isActive) {
          return;
        }

        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        const { data: patientData, error: patientError } =
          await supabase
            .from("patients")
            .select("id, name")
            .eq("owner_id", userData.user.id)
            .order("created_at", { ascending: true });

        if (!isActive) {
          return;
        }

        if (patientError) {
          throw new Error(patientError.message);
        }

        const patients = (patientData ?? []) as PatientRow[];

        if (patients.length === 0) {
          router.replace("/family/bind");
          return;
        }

        const storedPatientId =
          window.localStorage.getItem("current_patient_id");
        const patient =
          patients.find(
            (candidate) => candidate.id === storedPatientId,
          ) ?? patients[0];

        window.localStorage.setItem(
          "current_patient_id",
          patient.id,
        );
        setPatientName(patient.name);

        const response = await fetch(
          `/api/report/history?patientId=${encodeURIComponent(patient.id)}`,
        );

        if (!response.ok) {
          throw new Error("Report history request failed");
        }

        const data = (await response.json()) as {
          items?: ReportHistoryItem[];
        };

        if (isActive) {
          setItems(data.items ?? []);
        }
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法读取日报历史，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <Link
          href="/family/report"
          className="text-lg font-bold text-[#205c4b] underline decoration-[#9f9384] underline-offset-4"
        >
          ← 返回日报
        </Link>

        <header className="rounded-[28px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <p className="text-lg font-semibold text-[#7a6f61]">
            忆伴 · 家属端
          </p>
          <h1 className="mt-1 text-4xl font-bold text-[#205c4b] sm:text-5xl">
            日报历史
          </h1>
          <p className="mt-3 text-xl font-bold text-[#2d2924]">
            当前长辈：{patientName || "正在加载..."}
          </p>
          <p className="mt-2 text-lg text-[#7a6f61]">
            最近 30 天
          </p>
        </header>

        {isLoading && (
          <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-10 text-center text-xl text-[#7a6f61]">
            正在加载日报历史...
          </p>
        )}

        {!isLoading && errorMessage && (
          <p
            role="alert"
            className="rounded-3xl border border-[#e7b9b3] bg-[#fff0ef] px-6 py-10 text-center text-xl font-bold text-[#a33a31]"
          >
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && items.length === 0 && (
          <p className="rounded-3xl border border-dashed border-[#cfc3b3] bg-white/75 px-6 py-10 text-center text-xl leading-9 text-[#7a6f61]">
            最近 30 天还没有日报记录。
          </p>
        )}

        {!isLoading &&
          !errorMessage &&
          items.map((item) => (
            <Link
              key={item.date}
              href={`/family/report?date=${encodeURIComponent(item.date)}`}
              className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                    {formatDate(item.date)}
                  </h2>
                  <p className="mt-3 text-lg font-semibold text-[#5f5549]">
                    提问次数：{item.questionCount} 次
                  </p>
                </div>
                <span className="text-3xl text-[#9c6b3f]">›</span>
              </div>
              <p className="mt-4 text-lg leading-8 text-[#6f6457]">
                {item.adviceSummary}
              </p>
            </Link>
          ))}
      </div>

      <FamilyNav />
    </main>
  );
}