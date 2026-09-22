"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import FamilyNav from "@/components/FamilyNav";
import {
  clearReportCachesForPatient,
  getShanghaiDateKey,
  readReportCache,
  writeReportCache,
} from "@/lib/report-cache";

type ReportClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type PatientRow = {
  id: string;
  name: string;
};

type ConversationRow = {
  id: string;
  content: string;
  created_at: string;
};

type ConfirmedMemory = {
  id: string;
  content: string;
  count: number;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
};

type ReportData = {
  date: string;
  questions: ConversationRow[];
  confirmedMemories: ConfirmedMemory[];
  advice: string;
  hasReport?: boolean;
};

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function fetchLatestReport(
  patientId: string,
  dateKey: string,
): Promise<ReportData> {
  const query = new URLSearchParams({
    patientId,
    date: dateKey,
  });
  const response = await fetch(`/api/report?${query.toString()}`);

  if (!response.ok) {
    throw new Error("Report request failed");
  }

  return (await response.json()) as ReportData;
}
export default function ReportClient({
  supabaseUrl,
  supabaseAnonKey,
}: ReportClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date");
  const reportDateKey =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getShanghaiDateKey();
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
  const [currentPatientId, setCurrentPatientId] = useState("");
  const [currentDateKey, setCurrentDateKey] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function initializeReport() {
      setIsLoading(true);
      setErrorMessage("");
      setRefreshError("");
      let displayedCachedReport = false;

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
        const dateKey = reportDateKey;

        window.localStorage.setItem(
          "current_patient_id",
          patient.id,
        );
        setCurrentPatientId(patient.id);
        setCurrentDateKey(dateKey);
        setPatientName(patient.name);

        const cachedReport = readReportCache<ReportData>(
          patient.id,
          dateKey,
        );

        if (cachedReport && isActive) {
          setReport(cachedReport);
          setIsLoading(false);
          displayedCachedReport = true;
        }

        const latestReport = await fetchLatestReport(patient.id, dateKey);

        if (isActive) {
          setReport(latestReport);
          writeReportCache(patient.id, dateKey, latestReport);
        }
      } catch {
        if (isActive && !displayedCachedReport) {
          setErrorMessage("暂时无法生成日报，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void initializeReport();

    return () => {
      isActive = false;
    };
  }, [reportDateKey, router, supabase]);

  async function refreshReport() {
    if (!currentPatientId || !currentDateKey || isRefreshing) {
      return;
    }

    clearReportCachesForPatient(currentPatientId);
    setIsRefreshing(true);
    setRefreshError("");

    try {
      const latestReport = await fetchLatestReport(currentPatientId, currentDateKey);
      setReport(latestReport);
      writeReportCache(currentPatientId, currentDateKey, latestReport);
    } catch {
      setRefreshError("刷新失败，请稍后再试");
    } finally {
      setIsRefreshing(false);
    }
  }
  const hasTodayData =
    report !== null &&
    (report.questions.length > 0 ||
      report.confirmedMemories.length > 0);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <header className="rounded-[28px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/family/patients"
              className="text-base font-bold text-[#205c4b] underline decoration-[#9f9384] underline-offset-4 sm:text-lg"
            >
              ← 返回长辈管理
            </Link>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => void refreshReport()}
                disabled={isRefreshing || !currentPatientId}
                className="min-h-11 rounded-2xl bg-[#205c4b] px-4 text-base font-bold text-white transition hover:bg-[#18493c] disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg"
              >
                {isRefreshing ? "刷新中..." : "刷新日报"}
              </button>
              <Link
                href="/family/patients"
                className="text-base font-bold text-[#9c6b3f] underline decoration-[#d5b18d] underline-offset-4 sm:text-lg"
              >
                切换长辈
              </Link>
            </div>
          </div>

          {refreshError && (
            <p
              role="alert"
              className="mt-4 rounded-2xl bg-[#fff0ef] px-4 py-3 text-center text-base font-bold text-[#a33a31]"
            >
              {refreshError}
            </p>
          )}

          <p className="mt-5 text-base font-semibold text-[#7a6f61] sm:text-lg">
            忆伴 · 家属端
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-wide text-[#205c4b] sm:text-5xl">
            记忆日报
          </h1>
          <p className="mt-3 text-xl font-bold text-[#2d2924]">
            当前长辈：{patientName || "正在加载..."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <p className="text-lg font-medium text-[#5f5549] sm:text-xl">
              {report?.date ?? "正在整理当天数据..."}
            </p>
            <Link
              href="/family/report/history"
              className="text-base font-bold text-[#9c6b3f] underline decoration-[#d5b18d] underline-offset-4 sm:text-lg"
            >
              查看历史
            </Link>
          </div>
        </header>

        {isLoading && (
          <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-10 text-center text-xl text-[#7a6f61]">
            正在生成今天的数据...
          </p>
        )}

        {!isLoading && errorMessage && (
          <p
            role="alert"
            className="rounded-3xl border border-[#e7b9b3] bg-[#fff0ef] px-6 py-10 text-center text-xl font-semibold text-[#a33a31]"
          >
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && report?.hasReport === false && (
          <p className="rounded-3xl border border-dashed border-[#cfc3b3] bg-white/75 px-6 py-10 text-center text-xl leading-9 text-[#7a6f61]">
            这一天还没有日报记录。
          </p>
        )}

        {!isLoading && !errorMessage && report && report.hasReport !== false && (
          <>
            {!hasTodayData && (
              <p className="rounded-3xl border border-dashed border-[#cfc3b3] bg-white/75 px-6 py-10 text-center text-xl leading-9 text-[#7a6f61]">
                今天还没有对话记录，可以先陪长辈聊聊熟悉的人和事。
              </p>
            )}

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                今天长辈问了什么
              </h2>

              {report.questions.length === 0 ? (
                <p className="mt-5 text-xl leading-9 text-[#8b7f70]">
                  今天还没有对话记录
                </p>
              ) : (
                <div className="mt-5 flex flex-col gap-4">
                  {report.questions.map((question) => (
                    <article
                      key={question.id}
                      className="rounded-2xl bg-[#f7f3ea] px-5 py-4"
                    >
                      <p className="text-xl leading-8 text-[#2d2924] sm:text-2xl">
                        {question.content}
                      </p>
                      <time
                        dateTime={question.created_at}
                        className="mt-2 block text-base font-medium text-[#8b7f70]"
                      >
                        {formatTime(question.created_at)}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                哪些记忆被反复确认
              </h2>

              {report.confirmedMemories.length === 0 ? (
                <p className="mt-5 text-xl leading-9 text-[#8b7f70]">
                  今天还没有反复确认的记忆
                </p>
              ) : (
                <div className="mt-5 flex flex-col gap-4">
                  {report.confirmedMemories.map((memory) => (
                    <article
                      key={memory.id}
                      className="rounded-2xl bg-[#f7f3ea] px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-xl leading-8 text-[#2d2924] sm:text-2xl">
                          {memory.content}
                        </p>
                        <span className="shrink-0 rounded-full bg-[#205c4b] px-3 py-1 text-base font-bold text-white">
                          {memory.count} 次
                        </span>
                      </div>
                      {memory.emotion && (
                        <p className="mt-3 text-base font-semibold text-[#8a5a16]">
                          情绪：{memory.emotion}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-[#d7e5dc] bg-[#eef7f2] p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                给家属的建议
              </h2>
              <p className="mt-5 text-xl leading-9 text-[#2d2924] sm:text-2xl">
                {report.advice}
              </p>
            </section>
          </>
        )}
      </div>

      <FamilyNav />
    </main>
  );
}