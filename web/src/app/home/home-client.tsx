"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type HomeClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export default function HomeClient({
  supabaseUrl,
  supabaseAnonKey,
}: HomeClientProps) {
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
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCheckingFamily, setIsCheckingFamily] = useState(false);
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadCurrentUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!isActive) {
        return;
      }

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const email = data.user.email ?? "";
      setPhone(email.split("@")[0] || "已登录用户");
      setUserId(data.user.id);
      setIsLoading(false);
    }

    void loadCurrentUser();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  async function openFamilyEntry() {
    if (!userId || isCheckingFamily) {
      return;
    }

    setIsCheckingFamily(true);
    setHomeError("");

    try {
      const { data, error } = await supabase
        .from("patients")
        .select("id")
        .eq("owner_id", userId)
        .limit(1);

      if (error) {
        throw new Error(error.message);
      }

      router.push(data && data.length > 0 ? "/family" : "/family/bind");
    } catch {
      setHomeError("暂时无法检查绑定状态，请稍后再试");
    } finally {
      setIsCheckingFamily(false);
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
    <main className="min-h-dvh bg-[#f7f3ea] px-4 py-6 text-[#2d2924] sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-[32px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-[#7a6f61]">
                当前登录手机号
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[#205c4b] sm:text-4xl">
                {isLoading ? "正在加载..." : phone}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void signOut()}
              disabled={isSigningOut}
              className="min-h-12 shrink-0 rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 text-lg font-bold text-[#5f5549] transition hover:bg-[#f5f0e8] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut ? "正在退出..." : "退出登录"}
            </button>
          </div>
        </header>

        {homeError && (
          <p
            role="alert"
            className="rounded-2xl bg-[#fff0ef] px-5 py-4 text-center text-lg font-bold text-[#a33a31]"
          >
            {homeError}
          </p>
        )}

        <section className="grid gap-6 md:grid-cols-2">
          <Link
            href="/patient/bind"
            className="group flex min-h-56 flex-col justify-between rounded-[32px] bg-[#205c4b] p-6 text-white shadow-xl transition hover:-translate-y-1 hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 sm:p-8"
          >
            <div>
              <p className="text-lg font-semibold text-[#cce9dc]">
                进入陪伴对话
              </p>
              <h2 className="mt-3 text-4xl font-bold sm:text-5xl">
                患者端
              </h2>
            </div>
            <p className="mt-8 text-xl leading-9 text-[#e8fff5]">
              选择绑定患者后，开始温和的记忆陪伴。
            </p>
          </Link>

          <button
            type="button"
            onClick={() => void openFamilyEntry()}
            disabled={isLoading || isCheckingFamily}
            className="group flex min-h-56 flex-col justify-between rounded-[32px] bg-[#9c6b3f] p-6 text-left text-white shadow-xl transition hover:-translate-y-1 hover:bg-[#825431] focus:outline-none focus:ring-4 focus:ring-[#9c6b3f]/35 disabled:cursor-not-allowed disabled:opacity-70 sm:p-8"
          >
            <div>
              <p className="text-lg font-semibold text-[#f5deca]">
                管理记忆与日报
              </p>
              <h2 className="mt-3 text-4xl font-bold sm:text-5xl">
                {isCheckingFamily ? "正在检查..." : "家属端"}
              </h2>
            </div>
            <p className="mt-8 text-xl leading-9 text-[#fff4e9]">
              添加记忆、查看患者今天的对话和家属建议。
            </p>
          </button>
        </section>
      </div>
    </main>
  );
}