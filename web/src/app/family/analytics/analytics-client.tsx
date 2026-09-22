"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import FamilyNav from "@/components/FamilyNav";

type AnalyticsClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type PatientRow = {
  id: string;
  name: string;
};

type EmotionDatum = {
  name: string;
  value: number;
};

type QuestionDatum = {
  date: string;
  count: number;
};

type AnalyticsData = {
  emotionData: EmotionDatum[];
  questionData: QuestionDatum[];
};

const CHART_COLORS = [
  "#205c4b",
  "#4f8f78",
  "#9c6b3f",
  "#d39a55",
  "#7f9bb3",
  "#b77772",
  "#8a6fab",
];

export default function AnalyticsClient({
  supabaseUrl,
  supabaseAnonKey,
}: AnalyticsClientProps) {
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
  const [patientName, setPatientName] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadAnalytics() {
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

        window.localStorage.setItem(
          "current_patient_id",
          patient.id,
        );
        setPatientName(patient.name);

        const response = await fetch(
          `/api/analytics?patientId=${encodeURIComponent(patient.id)}`,
        );

        if (!response.ok) {
          throw new Error("Analytics request failed");
        }

        const data = (await response.json()) as AnalyticsData;

        if (isActive) {
          setAnalytics(data);
        }
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法加载统计数据，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <header className="rounded-[28px] border border-[#dfd6c8] bg-[#fffdf8] px-5 py-6 shadow-sm sm:px-8">
          <p className="text-lg font-semibold text-[#7a6f61]">
            忆伴 · 家属端
          </p>
          <h1 className="mt-1 text-4xl font-bold text-[#205c4b] sm:text-5xl">
            大屏统计
          </h1>
          <p className="mt-3 text-xl font-bold text-[#2d2924]">
            当前患者：{patientName || "正在加载..."}
          </p>
        </header>

        {isLoading && (
          <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-10 text-center text-xl text-[#7a6f61]">
            正在生成统计数据...
          </p>
        )}

        {!isLoading && errorMessage && (
          <p
            role="alert"
            className="rounded-3xl border border-[#e7b9b3] bg-[#fff0ef] px-6 py-10 text-center text-xl font-bold text-[#a33a31]"
          >
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && analytics && (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                心情占比
              </h2>
              <p className="mt-2 text-lg text-[#7a6f61]">
                根据记忆中的情绪标签统计
              </p>

              {analytics.emotionData.length === 0 ? (
                <p className="mt-8 rounded-2xl bg-[#f7f3ea] px-5 py-10 text-center text-xl text-[#8b7f70]">
                  暂无心情数据
                </p>
              ) : (
                <div className="mt-5 h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.emotionData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={105}
                        label
                      >
                        {analytics.emotionData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-2xl font-bold text-[#205c4b] sm:text-3xl">
                提问次数变化
              </h2>
              <p className="mt-2 text-lg text-[#7a6f61]">
                最近 7 天患者提问次数
              </p>

              <div className="mt-5 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={analytics.questionData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7dfd4" />
                    <XAxis dataKey="date" tick={{ fontSize: 14 }} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 14 }}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="提问次数"
                      stroke="#205c4b"
                      strokeWidth={3}
                      dot={{ r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        )}
      </div>

      <FamilyNav />
    </main>
  );
}