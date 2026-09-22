"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FamilyNav from "@/components/FamilyNav";
import {
  clearAllReportCaches,
  getShanghaiDateKey,
} from "@/lib/report-cache";

type SettingsClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type PatientRow = {
  id: string;
  name: string;
  family_contact: string | null;
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportType, setExportType] = useState<
    "memory" | "conversation" | "report" | "all"
  >("all");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

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
            .select("id, name, family_contact, created_at")
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

  async function exportPatientData() {
    if (!patient || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      const query = new URLSearchParams({
        patientId: patient.id,
        type: exportType,
      });
      const response = await fetch(`/api/export?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Export request failed");
      }

      const markdown = await response.text();
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safePatientName = patient.name.replace(
        /[\\/:*?"<>|]/g,
        "_",
      );

      link.href = downloadUrl;
      link.download = `忆伴_${safePatientName}_${getShanghaiDateKey()}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setIsExportOpen(false);
    } catch {
      setExportError("导出失败，请稍后再试");
    } finally {
      setIsExporting(false);
    }
  }
  async function signOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    clearAllReportCaches();

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
                当前长辈
              </h2>

              {patient ? (
                <div className="mt-5">
                  <p className="text-2xl font-bold text-[#2d2924]">
                    {patient.name}
                  </p>
                  <p className="mt-3 text-lg font-medium text-[#5f5549]">
                    联系方式：{patient.family_contact?.trim() || "未填写"}
                  </p>
                  <p className="mt-2 text-base font-medium text-[#8b7f70] sm:text-lg">
                    绑定时间：{formatCreatedAt(patient.created_at)}
                  </p>
                </div>
              ) : (
                <p className="mt-5 text-xl text-[#8b7f70]">
                  尚未绑定长辈
                </p>
              )}

              <Link
                href="/family/patients"
                className="mt-5 flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#205c4b] bg-white px-6 text-xl font-bold text-[#205c4b] transition hover:bg-[#eef7f2]"
              >
                管理长辈
              </Link>

              <button
                type="button"
                onClick={() => {
                  setExportError("");
                  setIsExportOpen(true);
                }}
                disabled={!patient}
                className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#9c6b3f] px-6 text-xl font-bold text-white transition hover:bg-[#825431] disabled:cursor-not-allowed disabled:opacity-60"
              >
                导出长辈数据
              </button>
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                长辈端入口
              </h2>
              <p className="mt-4 text-lg leading-8 text-[#7a6f61]">
                帮长辈打开这个页面，就可以开始对话
              </p>
              <Link
                href="/patient/bind"
                className="mt-5 flex min-h-16 items-center justify-center rounded-2xl bg-[#205c4b] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c]"
              >
                打开长辈端对话页
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

      {isExportOpen && patient && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            className="w-full max-w-xl rounded-[28px] border border-[#e4dbcf] bg-[#fffdf8] p-5 shadow-2xl sm:p-7"
          >
            <h2
              id="export-title"
              className="text-3xl font-bold text-[#205c4b]"
            >
              导出长辈数据
            </h2>
            <p className="mt-2 text-lg leading-8 text-[#7a6f61]">
              选择要导出的 Markdown 内容。
            </p>

            <div className="mt-5 grid gap-3">
              {[
                ["memory", "记忆列表"],
                ["conversation", "对话记录"],
                ["report", "日报记录"],
                ["all", "全部导出"],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 text-lg font-bold transition ${
                    exportType === value
                      ? "border-[#4f8f78] bg-[#eef7f2] text-[#205c4b]"
                      : "border-[#e4dbcf] bg-white text-[#5f5549]"
                  }`}
                >
                  <input
                    type="radio"
                    name="export-type"
                    value={value}
                    checked={exportType === value}
                    onChange={() =>
                      setExportType(
                        value as
                          | "memory"
                          | "conversation"
                          | "report"
                          | "all",
                      )
                    }
                    className="h-5 w-5 accent-[#205c4b]"
                  />
                  {label}
                </label>
              ))}
            </div>

            {exportError && (
              <p
                role="alert"
                className="mt-4 rounded-2xl bg-[#fff0ef] px-4 py-3 text-center text-base font-bold text-[#a33a31]"
              >
                {exportError}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsExportOpen(false)}
                disabled={isExporting}
                className="min-h-14 rounded-2xl border-2 border-[#cfc3b3] bg-white px-7 text-lg font-bold text-[#5f5549]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void exportPatientData()}
                disabled={isExporting}
                className="min-h-14 rounded-2xl bg-[#205c4b] px-7 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? "正在导出..." : "下载 Markdown"}
              </button>
            </div>
          </div>
        </div>
      )}
      <FamilyNav />
    </main>
  );
}