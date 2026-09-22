"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PatientBindClientProps = {
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
  }).format(date);
}

export default function PatientBindClient({
  supabaseUrl,
  supabaseAnonKey,
}: PatientBindClientProps) {
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
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [storedPatientId, setStoredPatientId] = useState("");
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
          .order("created_at", { ascending: true });

        if (!isActive) {
          return;
        }

        if (error) {
          throw new Error(error.message);
        }

        const patientRows = (data ?? []) as PatientRow[];

        if (patientRows.length === 1) {
          window.localStorage.setItem(
            "current_patient_id",
            patientRows[0].id,
          );
          router.replace("/patient");
          return;
        }

        setPatients(patientRows);
        setStoredPatientId(
          window.localStorage.getItem("current_patient_id") ?? "",
        );
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法读取患者列表，请稍后再试");
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

  function selectPatient(patientId: string) {
    window.localStorage.setItem(
      "current_patient_id",
      patientId,
    );
    router.push("/patient");
  }

  return (
    <main className="min-h-dvh bg-[#f7f3ea] px-4 py-6 text-[#2d2924] sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Link
          href="/home"
          className="text-lg font-bold text-[#205c4b] underline decoration-[#9f9384] underline-offset-4"
        >
          ← 返回主页
        </Link>

        <header className="rounded-[28px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <p className="text-lg font-semibold text-[#7a6f61]">
            忆伴 · 患者端
          </p>
          <h1 className="mt-2 text-4xl font-bold text-[#205c4b] sm:text-5xl">
            选择患者
          </h1>
          <p className="mt-3 text-lg leading-8 text-[#7a6f61]">
            选择后即可进入记忆陪伴对话。
          </p>
        </header>

        {isLoading && (
          <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-10 text-center text-xl text-[#7a6f61]">
            正在读取患者列表...
          </p>
        )}

        {!isLoading && errorMessage && (
          <p
            role="alert"
            className="rounded-3xl border border-[#e7b9b3] bg-[#fff0ef] px-6 py-8 text-center text-xl font-bold text-[#a33a31]"
          >
            {errorMessage}
          </p>
        )}

        {!isLoading &&
          !errorMessage &&
          patients.length === 0 && (
            <section className="rounded-[28px] border border-dashed border-[#cfc3b3] bg-white/75 px-6 py-10 text-center">
              <p className="text-xl leading-9 text-[#7a6f61]">
                请先在家属端绑定患者
              </p>
              <Link
                href="/family/bind"
                className="mt-6 flex min-h-16 items-center justify-center rounded-2xl bg-[#205c4b] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c]"
              >
                去家属端绑定患者
              </Link>
            </section>
          )}

        {!isLoading &&
          !errorMessage &&
          patients.map((patient) => {
            const isSelected = patient.id === storedPatientId;

            return (
              <article
                key={patient.id}
                className={`rounded-[28px] border bg-white p-5 shadow-sm sm:p-6 ${
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
                          上次选择
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-base font-medium text-[#8b7f70] sm:text-lg">
                      绑定于 {formatCreatedAt(patient.created_at)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => selectPatient(patient.id)}
                    className="min-h-14 rounded-2xl bg-[#205c4b] px-6 text-lg font-bold text-white shadow-md transition hover:bg-[#18493c]"
                  >
                    进入患者端
                  </button>
                </div>
              </article>
            );
          })}
      </div>
    </main>
  );
}