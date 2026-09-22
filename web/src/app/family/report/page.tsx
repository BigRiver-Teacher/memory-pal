"use client";

import { useEffect, useState } from "react";

const TEST_PATIENT_ID = "478504db-9cbe-4a31-b9f2-fd70c02cc95d";

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

export default function FamilyReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadReport() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/report?patientId=${encodeURIComponent(TEST_PATIENT_ID)}`,
        );

        if (!response.ok) {
          throw new Error("Report request failed");
        }

        const data = (await response.json()) as ReportData;

        if (isActive) {
          setReport(data);
        }
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法生成日报，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      isActive = false;
    };
  }, []);

  const hasTodayData =
    report !== null &&
    (report.questions.length > 0 ||
      report.confirmedMemories.length > 0);

  return (
    <main className="min-h-dvh bg-[#f7f3ea] px-4 py-6 text-[#2d2924] sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="rounded-[28px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <p className="text-base font-semibold text-[#7a6f61] sm:text-lg">
            忆伴 · 家属端
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-wide text-[#205c4b] sm:text-5xl">
            记忆日报
          </h1>
          <p className="mt-3 text-lg font-medium text-[#5f5549] sm:text-xl">
            {report?.date ?? "正在整理今天的数据..."}
          </p>
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

        {!isLoading && !errorMessage && report && (
          <>
            {!hasTodayData && (
              <p className="rounded-3xl border border-dashed border-[#cfc3b3] bg-white/75 px-6 py-10 text-center text-xl leading-9 text-[#7a6f61]">
                今天还没有对话记录，可以先陪患者聊聊熟悉的人和事。
              </p>
            )}

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                今天患者问了什么
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
    </main>
  );
}