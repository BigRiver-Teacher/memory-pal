import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmartClient } from "supadns-js";
import { describeApiFailure } from "@/lib/server-env";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

type ConversationRow = {
  content: string;
  created_at: string;
};

type MemoryRow = {
  emotion: string | null;
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

function getShanghaiHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}

function getActivePeriod(hour: number): "上午" | "下午" | "晚上" {
  if (hour >= 5 && hour < 12) {
    return "上午";
  }

  if (hour >= 12 && hour < 18) {
    return "下午";
  }

  return "晚上";
}

function extractTopicKeywords(
  conversations: ConversationRow[],
): { keyword: string; count: number }[] {
  const stopWords = new Set([
    "今天",
    "现在",
    "什么",
    "怎么",
    "有没有",
    "是不是",
    "一个",
    "时候",
    "我们",
    "你们",
    "他们",
    "这个",
    "那个",
    "可以",
    "知道",
    "记得",
    "请问",
    "一下",
    "是不是",
  ]);
  const keywordCounts = new Map<string, number>();
  const segmenter = new Intl.Segmenter("zh-CN", {
    granularity: "word",
  });

  for (const conversation of conversations) {
    for (const segment of segmenter.segment(
      conversation.content.normalize("NFKC"),
    )) {
      if (!segment.isWordLike) {
        continue;
      }

      const keyword = segment.segment.trim().toLowerCase();

      if (
        keyword.length < 2 ||
        stopWords.has(keyword) ||
        !/[\p{Script=Han}A-Za-z0-9]/u.test(keyword)
      ) {
        continue;
      }

      keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
    }
  }

  return [...keywordCounts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.keyword.localeCompare(right.keyword, "zh-CN"),
    )
    .slice(0, 5);
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
        .select("emotion, created_at")
        .eq("patient_id", patientId)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
      supabase
        .from("conversations")
        .select("content, created_at")
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

    const memories = (memoryResponse.data ?? []) as MemoryRow[];
    const conversations = (conversationResponse.data ??
      []) as ConversationRow[];
    const emotionTotals = new Map<string, number>();
    const emotionTrendCounts = new Map<string, Map<string, number>>();
    const memoryGrowthCounts = new Map<string, number>(
      dateOrder.map((date) => [date, 0]),
    );
    const questionCounts = new Map<string, number>(
      dateOrder.map((date) => [date, 0]),
    );
    const activePeriodCounts = new Map<string, number>([
      ["上午", 0],
      ["下午", 0],
      ["晚上", 0],
    ]);

    for (const memory of memories) {
      const dateKey = getShanghaiDateKey(new Date(memory.created_at));

      if (!memoryGrowthCounts.has(dateKey)) {
        continue;
      }

      const emotion = memory.emotion?.trim() || "未分类";
      const dateEmotions =
        emotionTrendCounts.get(dateKey) ?? new Map<string, number>();

      memoryGrowthCounts.set(
        dateKey,
        (memoryGrowthCounts.get(dateKey) ?? 0) + 1,
      );
      emotionTotals.set(emotion, (emotionTotals.get(emotion) ?? 0) + 1);
      dateEmotions.set(emotion, (dateEmotions.get(emotion) ?? 0) + 1);
      emotionTrendCounts.set(dateKey, dateEmotions);
    }

    for (const conversation of conversations) {
      const createdAt = new Date(conversation.created_at);
      const dateKey = getShanghaiDateKey(createdAt);

      if (questionCounts.has(dateKey)) {
        questionCounts.set(dateKey, (questionCounts.get(dateKey) ?? 0) + 1);
      }

      const period = getActivePeriod(getShanghaiHour(createdAt));
      activePeriodCounts.set(
        period,
        (activePeriodCounts.get(period) ?? 0) + 1,
      );
    }

    const emotionNames = [...emotionTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([emotion]) => emotion);
    const emotionTrend = dateOrder.map((date) => {
      const row: Record<string, string | number> = {
        date: dateLabels.get(date) ?? date,
      };
      const counts = emotionTrendCounts.get(date);

      for (const emotion of emotionNames) {
        row[emotion] = counts?.get(emotion) ?? 0;
      }

      return row;
    });
    const emotionTrendPointCount = [...emotionTotals.values()].reduce(
      (total, count) => total + count,
      0,
    );
    const memoryGrowthPointCount = [...memoryGrowthCounts.values()].filter(
      (count) => count > 0,
    ).length;

    return Response.json({
      emotionData: [...emotionTotals.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value),
      questionData: dateOrder.map((date) => ({
        date: dateLabels.get(date) ?? date,
        count: questionCounts.get(date) ?? 0,
      })),
      emotionTrend,
      emotionNames,
      memoryGrowth: dateOrder.map((date) => ({
        date: dateLabels.get(date) ?? date,
        count: memoryGrowthCounts.get(date) ?? 0,
      })),
      topTopics: extractTopicKeywords(conversations),
      activePeriods: [...activePeriodCounts.entries()].map(
        ([name, value]) => ({ name, value }),
      ),
      sufficiency: {
        emotionTrend: emotionTrendPointCount >= 3,
        memoryGrowth: memoryGrowthPointCount >= 3,
        topTopics: conversations.length >= 3,
        activePeriods: conversations.length >= 3,
      },
    });
  } catch (error) {
    console.error("Analytics API error:", error);

    return Response.json(
      { error: describeApiFailure(error, "生成统计数据失败，请稍后重试。") },
      { status: 500 },
    );
  }
}