import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmartClient } from "supadns-js";
import { describeApiFailure } from "@/lib/server-env";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

type ReportRow = {
  report_date: string;
  advice: string;
};

type ConversationRow = {
  created_at: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function createSupabaseClient(): SupabaseClient {
  return createSmartClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function getShanghaiDateParts(date: Date): {
  year: string;
  month: string;
  day: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function getShanghaiDateKey(date: Date): string {
  const { year, month, day } = getShanghaiDateParts(date);
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const patientId = new URL(request.url).searchParams
      .get("patientId")
      ?.trim();

    if (!patientId) {
      return Response.json(
        { error: "缺少 patientId 参数。" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseClient();
    const todayParts = getShanghaiDateParts(new Date());
    const todayStart = new Date(
      `${todayParts.year}-${todayParts.month}-${todayParts.day}T00:00:00+08:00`,
    );
    const start = new Date(todayStart.getTime() - 29 * DAY_MS);
    const end = new Date(todayStart.getTime() + DAY_MS);

    const [reportResponse, conversationResponse] = await Promise.all([
      supabase
        .from("reports")
        .select("report_date, advice")
        .eq("patient_id", patientId)
        .gte("report_date", getShanghaiDateKey(start))
        .lte("report_date", getShanghaiDateKey(todayStart))
        .order("report_date", { ascending: false }),
      supabase
        .from("conversations")
        .select("created_at")
        .eq("patient_id", patientId)
        .eq("role", "user")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
    ]);

    if (reportResponse.error) {
      throw new Error(
        `Supabase reports query failed: ${reportResponse.error.message}`,
      );
    }

    if (conversationResponse.error) {
      throw new Error(
        `Supabase conversations query failed: ${conversationResponse.error.message}`,
      );
    }

    const questionCounts = new Map<string, number>();

    for (const conversation of (conversationResponse.data ??
      []) as ConversationRow[]) {
      const dateKey = getShanghaiDateKey(new Date(conversation.created_at));
      questionCounts.set(dateKey, (questionCounts.get(dateKey) ?? 0) + 1);
    }

    return Response.json({
      items: ((reportResponse.data ?? []) as ReportRow[]).map(
        (report) => ({
          date: report.report_date,
          questionCount: questionCounts.get(report.report_date) ?? 0,
          adviceSummary: report.advice.slice(0, 30),
        }),
      ),
    });
  } catch (error) {
    console.error("Report history API error:", error);

    return Response.json(
      { error: describeApiFailure(error, "读取日报历史失败，请稍后重试。") },
      { status: 500 },
    );
  }
}