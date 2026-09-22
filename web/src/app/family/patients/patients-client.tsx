"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAllReportCaches } from "@/lib/report-cache";

type PatientsClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type PatientRow = {
  id: string;
  name: string;
  created_at: string;
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function PatientsClient({
  supabaseUrl,
  supabaseAnonKey,
}: PatientsClientProps) {
  const router = useRouter();
  const [supabase] = useState(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? supabaseAnonKey,
      {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [currentPatientId, setCurrentPatientId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadPatients() {
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

        const { data, error } = await supabase
          .from("patients")
          .select("id, name, created_at")
          .eq("owner_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (!isActive) {
          return;
        }

        if (error) {
          throw new Error(error.message);
        }

        const patientRows = (data ?? []) as PatientRow[];
        const storedPatientId =
          window.localStorage.getItem("current_patient_id");
        const selectedPatientId =
          patientRows.find(
            (patient) => patient.id === storedPatientId,
          )?.id ??
          patientRows[0]?.id ??
          "";

        if (selectedPatientId) {
          window.localStorage.setItem(
            "current_patient_id",
            selectedPatientId,
          );
        }

        setPatients(patientRows);
        setCurrentPatientId(selectedPatientId);
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法读取长辈列表，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPatients();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  function switchPatient(patientId: string) {
    clearAllReportCaches();
    window.localStorage.setItem(
      "current_patient_id",
      patientId,
    );
    router.push("/family");
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#f7f3ea] text-[#2d2924]">
      <header className="shrink-0 border-b border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-5 shadow-sm backdrop-blur sm:px-8 sm:py-6">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-base font-semibold text-[#7a6f61] sm:text-lg">
            忆伴 · 家属端
          </p>
          <h1 className="mt-1 text-4xl font-bold text-[#205c4b] sm:text-5xl">
            长辈管理
          </h1>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {isLoading && (
            <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-10 text-center text-xl text-[#7a6f61]">
              正在加载长辈列表...
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

          {!isLoading &&
            !errorMessage &&
            patients.length === 0 && (
              <p className="rounded-3xl border border-dashed border-[#cfc3b3] bg-white/70 px-6 py-10 text-center text-xl leading-9 text-[#7a6f61]">
                还没有绑定长辈，点击下方按钮添加。
              </p>
            )}

          {!isLoading &&
            !errorMessage &&
            patients.map((patient) => {
              const isSelected =
                patient.id === currentPatientId;

              return (
                <article
                  key={patient.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchPatient(patient.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      switchPatient(patient.id);
                    }
                  }}
                  className={`cursor-pointer rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/25 sm:p-6 ${
                    isSelected
                      ? "border-[#4f8f78] ring-2 ring-[#4f8f78]/20"
                      : "border-[#e4dbcf]"
                  }`}
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-bold text-[#2d2924] sm:text-3xl">
                          {patient.name}
                        </h2>
                        {isSelected && (
                          <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-base font-bold text-[#205c4b]">
                            当前选中
                          </span>
                        )}
                      </div>
                      <time
                        dateTime={patient.created_at}
                        className="mt-3 block text-base font-medium text-[#8b7f70] sm:text-lg"
                      >
                        创建于 {formatCreatedAt(patient.created_at)}
                      </time>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        switchPatient(patient.id);
                      }}
                      disabled={isSelected}
                      className="min-h-14 rounded-2xl bg-[#205c4b] px-6 text-lg font-bold text-white shadow-md transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 disabled:cursor-not-allowed disabled:bg-[#a8bdb4]"
                    >
                      {isSelected ? "当前长辈" : "切换到此长辈"}
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      </section>

      <footer className="shrink-0 border-t border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-4 shadow-[0_-8px_24px_rgba(72,58,42,0.08)] backdrop-blur sm:px-8 sm:py-5">
        <Link
          href="/family/bind"
          className="mx-auto flex min-h-16 w-full max-w-4xl items-center justify-center rounded-2xl bg-[#9c6b3f] px-8 text-xl font-bold text-white shadow-lg transition hover:bg-[#825431] focus:outline-none focus:ring-4 focus:ring-[#9c6b3f]/35"
        >
          添加新长辈
        </Link>
      </footer>
    </main>
  );
}