"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginFormProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type FormValues = {
  email: string;
  password: string;
};

function mapAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already registered") ||
    normalized.includes("user already registered")
  ) {
    return "该手机号已注册";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "手机号或密码错误";
  }

  if (normalized.includes("email not confirmed")) {
    return "账号尚未验证，请在 Supabase 中关闭 Confirm email";
  }

  if (
    normalized.includes("password") &&
    normalized.includes("at least")
  ) {
    return "密码至少需要 6 位";
  }

  if (
    normalized.includes("signups not allowed") ||
    normalized.includes("signup") &&
      normalized.includes("disabled")
  ) {
    return "Supabase 当前未开启邮箱注册";
  }

  return "操作失败，请稍后重试";
}

export default function LoginForm({
  supabaseUrl,
  supabaseAnonKey,
}: LoginFormProps) {
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
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isBusy = isRegistering || isLoggingIn;

  function validateAndBuildValues(): FormValues | null {
    if (!/^\d{11}$/.test(phone)) {
      setErrorMessage("请输入 11 位手机号");
      return null;
    }

    if (password.length < 6) {
      setErrorMessage("密码至少需要 6 位");
      return null;
    }

    return {
      email: `${phone}@memory-pal.local`,
      password,
    };
  }

  async function register() {
    if (isBusy) {
      return;
    }

    const values = validateAndBuildValues();

    if (!values) {
      return;
    }

    setErrorMessage("");
    setIsRegistering(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });

      if (error) {
        setErrorMessage(mapAuthError(error.message));
        return;
      }

      if (data.user?.identities?.length === 0) {
        setErrorMessage("该手机号已注册");
        return;
      }

      if (!data.session) {
        const { error: loginError } =
          await supabase.auth.signInWithPassword(values);

        if (loginError) {
          setErrorMessage(mapAuthError(loginError.message));
          return;
        }
      }

      router.push("/home");
      router.refresh();
    } catch {
      setErrorMessage("操作失败，请稍后重试");
    } finally {
      setIsRegistering(false);
    }
  }

  async function login() {
    if (isBusy) {
      return;
    }

    const values = validateAndBuildValues();

    if (!values) {
      return;
    }

    setErrorMessage("");
    setIsLoggingIn(true);

    try {
      const { error } = await supabase.auth.signInWithPassword(
        values,
      );

      if (error) {
        setErrorMessage(mapAuthError(error.message));
        return;
      }

      router.push("/home");
      router.refresh();
    } catch {
      setErrorMessage("操作失败，请稍后重试");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f3ea] px-4 py-8 text-[#2d2924] sm:px-8">
      <section className="w-full max-w-lg rounded-[32px] border border-[#e4dbcf] bg-[#fffdf8] p-6 shadow-xl sm:p-9">
        <header className="text-center">
          <p className="text-lg font-semibold text-[#7a6f61]">
            陪伴每一段记忆
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-wide text-[#205c4b] sm:text-5xl">
            忆伴
          </h1>
          <h2 className="mt-5 text-3xl font-bold text-[#2d2924]">
            手机号注册 / 登录
          </h2>
          <p className="mt-3 text-lg leading-8 text-[#7a6f61]">
            输入手机号和密码即可继续
          </p>
        </header>

        <form
          className="mt-8 flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <div>
            <label
              htmlFor="phone"
              className="text-lg font-bold text-[#3f382f]"
            >
              手机号
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              value={phone}
              onChange={(event) =>
                setPhone(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 11),
                )
              }
              placeholder="请输入 11 位手机号"
              className="mt-3 min-h-16 w-full rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 text-xl text-[#2d2924] outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-lg font-bold text-[#3f382f]"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位密码"
              className="mt-3 min-h-16 w-full rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 text-xl text-[#2d2924] outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
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

          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="submit"
              disabled={isBusy}
              className="min-h-16 flex-1 rounded-2xl bg-[#205c4b] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingIn ? "正在登录..." : "登录"}
            </button>
            <button
              type="button"
              onClick={() => void register()}
              disabled={isBusy}
              className="min-h-16 flex-1 rounded-2xl border-2 border-[#205c4b] bg-white px-6 text-xl font-bold text-[#205c4b] shadow-sm transition hover:bg-[#eef7f2] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRegistering ? "正在注册..." : "注册"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}