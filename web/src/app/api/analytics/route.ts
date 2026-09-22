import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

type ConversationRow = {
  created_at: string;
};

type MemoryRow = {
  emotion: string | null;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function createSupabaseClient(): SupabaseClient {
  return createClient(
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
    const start = new Date(todayStart.getTime() - 6 * DAY_MS);
    const end = new Date(todayStart.getTime() + DAY_MS);
    const dateOrder: string[] = [];
    const dateLabels = new Map<string, string>();

    for (let index = 0; index < 7; index += 1) {
      const date = new Date(start.getTime() + index * DAY_MS);
      const key = getShanghaiDateKey(date);
      const { month, day } = getShanghaiDateParts(date);
      dateOrder.push(key);
      dateLabels.set(key, `${month}/${day}`);
    }

    const [memoryResponse, conversationResponse] = await Promise.all([
      supabase
        .from("memories")
        .select("emotion")
        .eq("patient_id", patientId),
      supabase
        .from("conversations")
        .select("created_at")
        .eq("patient_id", patientId)
        .eq("role", "user")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
    ]);

    if (memoryResponse.error) {
      throw new Error(
        `Supabase memories query failed: ${memoryResponse.error.message}`,
      );
    }

    if (conversationResponse.error) {
      throw new Error(
        `Supabase conversations query failed: ${conversationResponse.error.message}`,
      );
    }

    const emotionCounts = new Map<string, number>();

    for (const memory of (memoryResponse.data ?? []) as MemoryRow[]) {
      const emotion = memory.emotion?.trim() || "未分类";
      emotionCounts.set(emotion, (emotionCounts.get(emotion) ?? 0) + 1);
    }

    const questionCounts = new Map<string, number>(
      dateOrder.map((date) => [date, 0]),
    );

    for (const conversation of (conversationResponse.data ??
      []) as ConversationRow[]) {
      const dateKey = getShanghaiDateKey(new Date(conversation.created_at));

      if (questionCounts.has(dateKey)) {
        questionCounts.set(dateKey, (questionCounts.get(dateKey) ?? 0) + 1);
      }
    }

    return Response.json({
      emotionData: [...emotionCounts.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value),
      questionData: dateOrder.map((date) => ({
        date: dateLabels.get(date) ?? date,
        count: questionCounts.get(date) ?? 0,
      })),
    });
  } catch (error) {
    console.error("Analytics API error:", error);

    return Response.json(
      { error: "生成统计数据失败，请稍后重试。" },
      { status: 500 },
    );
  }
}