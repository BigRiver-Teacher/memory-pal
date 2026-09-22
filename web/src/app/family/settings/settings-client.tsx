"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FamilyNav from "@/components/FamilyNav";

type SettingsClientProps = {
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

export default function SettingsClient({
  supabaseUrl,
  supabaseAnonKey,
}: SettingsClientProps) {
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
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      setIsLoading(true);
      setErrorMessage("");

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

        const email = userData.user.email ?? "";
        setPhone(email.split("@")[0] || "已登录用户");
        setNickname(
          typeof userData.user.user_metadata?.nickname === "string"
            ? userData.user.user_metadata.nickname
            : "",
        );

        const { data: patientData, error: patientError } =
          await supabase
            .from("patients")
            .select("id, name, created_at")
            .eq("owner_id", userData.user.id)
            .order("created_at", { ascending: true });

        if (!isActive) {
          return;
        }

        if (patientError) {
          throw new Error(patientError.message);
        }

        const patients = (patientData ?? []) as PatientRow[];

        if (patients.length > 0) {
          const storedPatientId =
            window.localStorage.getItem("current_patient_id");
          const selectedPatient =
            patients.find(
              (candidate) => candidate.id === storedPatientId,
            ) ?? patients[0];

          window.localStorage.setItem(
            "current_patient_id",
            selectedPatient.id,
          );
          setPatient(selectedPatient);
        }
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法读取设置信息，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  async function saveNickname() {
    const trimmedNickname = nickname.trim();

    if (isSaving) {
      return;
    }

    setMessage("");
    setErrorMessage("");
    setIsSaving(true);

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          ...userData.user.user_metadata,
          nickname: trimmedNickname,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setNickname(trimmedNickname);
      setMessage("家属昵称已保存");
    } catch {
      setErrorMessage("保存失败，请稍后再试");
    } finally {
      setIsSaving(false);
    }
  }

  async function signOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <header className="rounded-[28px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <p className="text-lg font-semibold text-[#7a6f61]">
            忆伴 · 家属端
          </p>
          <h1 className="mt-1 text-4xl font-bold text-[#205c4b] sm:text-5xl">
            设置
          </h1>
        </header>

        {isLoading && (
          <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-10 text-center text-xl text-[#7a6f61]">
            正在加载设置...
          </p>
        )}

        {!isLoading && errorMessage && (
          <p
            role="alert"
            className="rounded-3xl border border-[#e7b9b3] bg-[#fff0ef] px-6 py-6 text-center text-lg font-bold text-[#a33a31]"
          >
            {errorMessage}
          </p>
        )}

        {!isLoading && (
          <>
            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                家属信息
              </h2>
              <div className="mt-5">
                <p className="text-base font-semibold text-[#7a6f61]">
                  当前登录手机号
                </p>
                <p className="mt-2 text-2xl font-bold text-[#2d2924]">
                  {phone}
                </p>
              </div>

              <div className="mt-6">
                <label
                  htmlFor="family-nickname"
                  className="text-lg font-bold text-[#3f382f]"
                >
                  家属昵称
                </label>
                <input
                  id="family-nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="请输入家属昵称"
                  maxLength={50}
                  className="mt-3 min-h-16 w-full rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 text-xl outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
                />
                <button
                  type="button"
                  onClick={() => void saveNickname()}
                  disabled={isSaving}
                  className="mt-4 min-h-14 w-full rounded-2xl bg-[#205c4b] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isSaving ? "正在保存..." : "保存昵称"}
                </button>
                {message && (
                  <p className="mt-3 text-lg font-bold text-[#205c4b]">
                    {message}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                当前患者
              </h2>

              {patient ? (
                <div className="mt-5">
                  <p className="text-2xl font-bold text-[#2d2924]">
                    {patient.name}
                  </p>
                  <p className="mt-3 text-base font-medium text-[#8b7f70] sm:text-lg">
                    绑定时间：{formatCreatedAt(patient.created_at)}
                  </p>
                </div>
              ) : (
                <p className="mt-5 text-xl text-[#8b7f70]">
                  尚未绑定患者
                </p>
              )}

              <Link
                href="/family/patients"
                className="mt-5 flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#205c4b] bg-white px-6 text-xl font-bold text-[#205c4b] transition hover:bg-[#eef7f2]"
              >
                管理患者
              </Link>
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                患者端入口
              </h2>
              <p className="mt-4 text-lg leading-8 text-[#7a6f61]">
                帮患者打开这个页面，就可以开始对话
              </p>
              <Link
                href="/patient/bind"
                className="mt-5 flex min-h-16 items-center justify-center rounded-2xl bg-[#205c4b] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c]"
              >
                打开患者端对话页
              </Link>
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                关于忆伴
              </h2>
              <p className="mt-4 text-xl leading-9 text-[#2d2924]">
                忆伴是一个面向阿尔茨海默症家庭的 AI 记忆陪伴系统。
              </p>
              <p className="mt-3 text-lg font-bold text-[#8b7f70]">
                v0.1.0
              </p>
            </section>

            <section className="rounded-[28px] border border-[#e7b9b3] bg-[#fff7f6] p-5 shadow-sm sm:p-7">
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={isSigningOut}
                className="min-h-16 w-full rounded-2xl bg-[#a33a31] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#842d26] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut ? "正在退出..." : "退出登录"}
              </button>
            </section>
          </>
        )}
      </div>

      <FamilyNav />
    </main>
  );
}