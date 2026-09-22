import ReportHistoryClient from "./report-history-client";

export const dynamic = "force-dynamic";

export default function ReportHistoryPage() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f3ea] px-4 py-8 text-[#2d2924]">
        <section className="w-full max-w-lg rounded-[28px] border border-[#e7b9b3] bg-[#fff0ef] p-6 text-center shadow-sm sm:p-8">
          <h1 className="text-3xl font-bold text-[#a33a31]">
            登录服务尚未配置
          </h1>
          <p className="mt-4 text-lg leading-8 text-[#6f6457]">
            请配置 SUPABASE_URL 和 SUPABASE_ANON_KEY，然后重启开发服务器。
          </p>
        </section>
      </main>
    );
  }

  return (
    <ReportHistoryClient
      supabaseUrl={supabaseUrl}
      supabaseAnonKey={supabaseAnonKey}
    />
  );
}