import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const SILICONFLOW_EMBEDDINGS_URL =
  "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-m3";
const EXPECTED_DIMENSION = 1024;
const MIN_SIMILARITY = 0.5;

type ConversationRow = {
  id: string;
  content: string;
  created_at: string;
};

type MemoryRow = {
  id: string;
  content: string;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
};

type MemoryMatch = {
  memory_id: string;
  content: string;
  similarity: number;
};

type ConfirmedMemory = {
  id: string;
  content: string;
  count: number;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
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

function getTodayRange(): {
  start: string;
  end: string;
  dateLabel: string;
} {
  const now = new Date();
  const { year, month, day } = getShanghaiDateParts(now);
  const start = new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    dateLabel: new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(now),
  };
}

async function createEmbedding(
  content: string,
  apiKey: string,
): Promise<number[]> {
  const response = await fetch(SILICONFLOW_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: content,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `SiliconFlow request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = result.data?.[0]?.embedding;

  if (
    !Array.isArray(embedding) ||
    embedding.length !== EXPECTED_DIMENSION ||
    !embedding.every((value) => typeof value === "number")
  ) {
    throw new Error("Invalid embedding response");
  }

  return embedding;
}

async function findConfirmedMemories(
  supabase: SupabaseClient,
  patientId: string,
  questions: ConversationRow[],
  memories: MemoryRow[],
  siliconflowApiKey: string,
): Promise<ConfirmedMemory[]> {
  const memoryById = new Map(
    memories.map((memory) => [memory.id, memory]),
  );
  const counts = new Map<string, number>();
  const embeddingCache = new Map<string, number[]>();

  for (const question of questions) {
    let embedding = embeddingCache.get(question.content);

    if (!embedding) {
      embedding = await createEmbedding(
        question.content,
        siliconflowApiKey,
      );
      embeddingCache.set(question.content, embedding);
    }

    const { data, error } = await supabase.rpc("match_memories", {
      p_patient_id: patientId,
      p_query_embedding: embedding,
      p_match_count: 1,
    });

    if (error) {
      throw new Error(
        `Supabase match_memories failed: ${error.message}`,
      );
    }

    const match = ((data ?? []) as MemoryMatch[])[0];

    if (
      match &&
      match.similarity >= MIN_SIMILARITY &&
      memoryById.has(match.memory_id)
    ) {
      counts.set(
        match.memory_id,
        (counts.get(match.memory_id) ?? 0) + 1,
      );
    }
  }

  return [...counts.entries()]
    .map(([memoryId, count]) => {
      const memory = memoryById.get(memoryId);

      if (!memory) {
        return null;
      }

      return {
        id: memory.id,
        content: memory.content,
        count,
        emotion: memory.emotion,
        entities: memory.entities,
        source: memory.source,
      };
    })
    .filter((memory): memory is ConfirmedMemory => memory !== null)
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.content.localeCompare(right.content, "zh-CN"),
    );
}

async function generateAdvice(
  apiKey: string,
  questions: ConversationRow[],
  confirmedMemories: ConfirmedMemory[],
): Promise<string> {
  if (questions.length === 0 && confirmedMemories.length === 0) {
    return "今天还没有对话记录，可以先陪患者聊聊熟悉的人和事。";
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content:
            "你是家属沟通建议助手。请只输出一句温和、具体、容易执行的中文建议，" +
            "不超过 80 个字。只能依据用户提供的数据，不要编造信息。",
        },
        {
          role: "user",
          content: JSON.stringify({
            questions: questions.map((question) => ({
              content: question.content,
              created_at: question.created_at,
            })),
            confirmed_memories: confirmedMemories.map((memory) => ({
              content: memory.content,
              count: memory.count,
            })),
          }),
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek advice request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const advice = result.choices?.[0]?.message?.content?.trim();

  if (!advice) {
    throw new Error("Invalid DeepSeek advice response");
  }

  return advice.replace(/\s+/g, " ");
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

    const siliconflowApiKey = getRequiredEnv(
      "SILICONFLOW_API_KEY",
    );
    const deepseekApiKey = getRequiredEnv("DEEPSEEK_API_KEY");
    const supabase = createSupabaseClient();
    const { start, end, dateLabel } = getTodayRange();

    const { data: questionData, error: questionError } =
      await supabase
        .from("conversations")
        .select("id, content, created_at")
        .eq("patient_id", patientId)
        .eq("role", "user")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false });

    if (questionError) {
      throw new Error(
        `Supabase conversations query failed: ${questionError.message}`,
      );
    }

    const { data: memoryData, error: memoryError } = await supabase
      .from("memories")
      .select("id, content, emotion, entities, source")
      .eq("patient_id", patientId);

    if (memoryError) {
      throw new Error(
        `Supabase memories query failed: ${memoryError.message}`,
      );
    }

    const questions = (questionData ?? []) as ConversationRow[];
    const memories = (memoryData ?? []) as MemoryRow[];
    const confirmedMemories = await findConfirmedMemories(
      supabase,
      patientId,
      questions,
      memories,
      siliconflowApiKey,
    );

    let advice: string;

    try {
      advice = await generateAdvice(
        deepseekApiKey,
        questions,
        confirmedMemories,
      );
    } catch (error) {
      console.error("Report advice generation failed:", error);
      advice = "今天可以陪患者聊聊她熟悉的人和事。";
    }

    return Response.json({
      date: dateLabel,
      questions,
      confirmedMemories,
      advice,
    });
  } catch (error) {
    console.error("Report API error:", error);

    return Response.json(
      { error: "生成记忆日报失败，请稍后重试。" },
      { status: 500 },
    );
  }
}