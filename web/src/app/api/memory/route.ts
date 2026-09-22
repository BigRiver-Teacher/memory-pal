import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const SILICONFLOW_EMBEDDINGS_URL =
  "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-m3";
const EXPECTED_DIMENSION = 1024;

type MemoryRow = {
  id: string;
  content: string;
  created_at: string;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
};

type MemoryMetadata = {
  emotion: string;
  entities: string[];
};

type CreateMemoryBody = {
  patientId: string;
  content: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function parseCreateMemoryBody(
  value: unknown,
): CreateMemoryBody | null {
  if (!isRecord(value)) {
    return null;
  }

  const patientId = value.patientId;
  const content = value.content;

  if (
    typeof patientId !== "string" ||
    !patientId.trim() ||
    typeof content !== "string" ||
    !content.trim()
  ) {
    return null;
  }

  return {
    patientId: patientId.trim(),
    content: content.trim(),
  };
}

async function createEmbedding(content: string): Promise<number[]> {
  const response = await fetch(SILICONFLOW_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRequiredEnv("SILICONFLOW_API_KEY")}`,
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

async function extractMemoryMetadata(
  content: string,
): Promise<MemoryMetadata> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRequiredEnv("DEEPSEEK_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content:
            "请从家属录入的记忆中提取情绪和关联人物，" +
            "并且只输出 json 对象。" +
            '格式必须是 {"emotion":"","entities":[]}。' +
            "emotion 是简短情绪词；entities 是人物、地点、物品等关键词数组。",
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek metadata request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const responseContent =
    result.choices?.[0]?.message?.content?.trim();

  if (!responseContent) {
    throw new Error("Invalid DeepSeek metadata response");
  }

  const parsed = JSON.parse(responseContent) as unknown;

  if (!isRecord(parsed)) {
    return { emotion: "", entities: [] };
  }

  return {
    emotion:
      typeof parsed.emotion === "string"
        ? parsed.emotion.trim()
        : "",
    entities: Array.isArray(parsed.entities)
      ? parsed.entities.filter(
          (entity): entity is string => typeof entity === "string",
        )
      : [],
  };
}
async function findExistingMemory(
  supabase: SupabaseClient,
  patientId: string,
  content: string,
): Promise<MemoryRow | null> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, content, created_at, emotion, entities, source")
    .eq("patient_id", patientId)
    .eq("content", content)
    .limit(1);

  if (error) {
    throw new Error(`Supabase memory lookup failed: ${error.message}`);
  }

  return ((data ?? []) as MemoryRow[])[0] ?? null;
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
    const { data, error } = await supabase
      .from("memories")
      .select("id, content, created_at, emotion, entities, source")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Supabase memory list failed: ${error.message}`);
    }

    return Response.json({
      memories: (data ?? []) as MemoryRow[],
    });
  } catch (error) {
    console.error("Memory GET API error:", error);

    return Response.json(
      { error: "读取记忆失败，请稍后重试。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseCreateMemoryBody(await request.json());

    if (!body) {
      return Response.json(
        { error: "请求参数必须包含 patientId 和 content。" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseClient();
    const existingMemory = await findExistingMemory(
      supabase,
      body.patientId,
      body.content,
    );

    if (existingMemory) {
      return Response.json({
        memory: existingMemory,
        duplicate: true,
      });
    }

    const metadata = await extractMemoryMetadata(body.content);
    const embedding = await createEmbedding(body.content);
    const { data, error } = await supabase
      .from("memories")
      .insert({
        patient_id: body.patientId,
        content: body.content,
        embedding,
        emotion: metadata.emotion || null,
        entities: metadata.entities,
        source: "family",
      })
      .select("id, content, created_at, emotion, entities, source")
      .single();

    if (error) {
      throw new Error(`Supabase memory insert failed: ${error.message}`);
    }

    return Response.json({
      memory: data as MemoryRow,
      duplicate: false,
    });
  } catch (error) {
    console.error("Memory POST API error:", error);

    return Response.json(
      { error: "保存记忆失败，请稍后重试。" },
      { status: 500 },
    );
  }
}