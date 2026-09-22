"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type FamilyBindFormProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export default function FamilyBindForm({
  supabaseUrl,
  supabaseAnonKey,
}: FamilyBindFormProps) {
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
  const [userId, setUserId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [familyContact, setFamilyContact] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadCurrentUser() {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (!isActive) {
        return;
      }

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      setUserId(userData.user.id);
      setIsChecking(false);
    }

    void loadCurrentUser();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  async function submitBinding() {
    const trimmedName = patientName.trim();
    const trimmedContact = familyContact.trim();

    if (!userId || isSubmitting) {
      return;
    }

    if (!trimmedName) {
      setErrorMessage("请输入长辈昵称");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("patients")
        .insert({
          owner_id: userId,
          name: trimmedName,
          family_contact: trimmedContact || null,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.id) {
        throw new Error("Patient id was not returned");
      }

      window.localStorage.setItem(
        "current_patient_id",
        data.id as string,
      );
      router.replace("/family");
      router.refresh();
    } catch {
      setErrorMessage("绑定失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f3ea] px-4 py-8 text-[#2d2924] sm:px-8">
      <section className="w-full max-w-xl rounded-[32px] border border-[#e4dbcf] bg-[#fffdf8] p-6 shadow-xl sm:p-9">
        <Link
          href="/home"
          className="text-lg font-bold text-[#205c4b] underline decoration-[#9f9384] underline-offset-4"
        >
          返回主页
        </Link>

        <header className="mt-6">
          <p className="text-lg font-semibold text-[#7a6f61]">
            忆伴 · 家属端
          </p>
          <h1 className="mt-2 text-4xl font-bold text-[#205c4b]">
            添加长辈
          </h1>
          <p className="mt-3 text-lg leading-8 text-[#7a6f61]">
            可以添加多个长辈，当前选中的长辈会用于记忆管理。
          </p>
        </header>

        {isChecking ? (
          <p className="mt-8 rounded-2xl bg-[#f7f3ea] px-5 py-6 text-center text-xl text-[#7a6f61]">
            正在检查绑定状态...
          </p>
        ) : (
          <form
            className="mt-8 flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBinding();
            }}
          >
            <div>
              <label
                htmlFor="patient-name"
                className="text-lg font-bold text-[#3f382f]"
              >
                长辈昵称
                <span className="ml-1 text-[#a33a31]">*</span>
              </label>
              <input
                id="patient-name"
                required
                maxLength={50}
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
                placeholder="例如：妈妈"
                className="mt-3 min-h-16 w-full rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 text-xl outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
              />
            </div>

            <div>
              <label
                htmlFor="family-contact"
                className="text-lg font-bold text-[#3f382f]"
              >
                家属联系方式
                <span className="ml-2 text-base font-medium text-[#8b7f70]">
                  选填
                </span>
              </label>
              <input
                id="family-contact"
                maxLength={100}
                value={familyContact}
                onChange={(event) => setFamilyContact(event.target.value)}
                placeholder="手机号、微信号或其他联系方式"
                className="mt-3 min-h-16 w-full rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 text-xl outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
              />
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-2xl bg-[#fff0ef] px-5 py-4 text-center text-lg font-bold text-[#a33a31]"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-16 rounded-2xl bg-[#205c4b] px-8 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "正在添加..." : "确认添加"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}