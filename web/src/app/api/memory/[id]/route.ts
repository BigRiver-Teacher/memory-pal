import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmartClient } from "supadns-js";
import { describeApiFailure } from "@/lib/server-env";

export const runtime = "nodejs";

const SILICONFLOW_EMBEDDINGS_URL =
  "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-m3";
const EXPECTED_DIMENSION = 1024;
const MIN_SIMILARITY = 0.5;

type MemoryRow = {
  id: string;
  patient_id: string;
  content: string;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
  created_at: string;
};

type ConversationRow = {
  content: string;
  created_at: string;
};

type MemoryMatch = {
  memory_id: string;
  similarity: number;
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

async function getAuthenticatedUser(
  request: Request,
  supabase: SupabaseClient,
) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function findOwnedMemory(
  supabase: SupabaseClient,
  memoryId: string,
  userId: string,
): Promise<MemoryRow | null> {
  const { data: memoryData, error: memoryError } = await supabase
    .from("memories")
    .select(
      "id, patient_id, content, emotion, entities, source, created_at",
    )
    .eq("id", memoryId)
    .limit(1);

  if (memoryError) {
    throw new Error(`Supabase memory lookup failed: ${memoryError.message}`);
  }

  const memory = ((memoryData ?? []) as MemoryRow[])[0];

  if (!memory) {
    return null;
  }

  const { data: patientData, error: patientError } = await supabase
    .from("patients")
    .select("id")
    .eq("id", memory.patient_id)
    .eq("owner_id", userId)
    .limit(1);

  if (patientError) {
    throw new Error(`Supabase ownership check failed: ${patientError.message}`);
  }

  return (patientData ?? []).length > 0 ? memory : null;
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

async function countMemoryQuestions(
  supabase: SupabaseClient,
  memory: MemoryRow,
): Promise<{ askedCount: number; lastAskedAt: string | null }> {
  const { data, error } = await supabase
    .from("conversations")
    .select("content, created_at")
    .eq("patient_id", memory.patient_id)
    .eq("role", "user")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Supabase conversations query failed: ${error.message}`);
  }

  const conversations = (data ?? []) as ConversationRow[];
  const embeddingCache = new Map<string, number[]>();
  let askedCount = 0;
  let lastAskedAt: string | null = null;

  for (const conversation of conversations) {
    let embedding = embeddingCache.get(conversation.content);

    if (!embedding) {
      embedding = await createEmbedding(conversation.content);
      embeddingCache.set(conversation.content, embedding);
    }

    const { data: matchData, error: matchError } = await supabase.rpc(
      "match_memories",
      {
        p_patient_id: memory.patient_id,
        p_query_embedding: embedding,
        p_match_count: 1,
      },
    );

    if (matchError) {
      throw new Error(
        `Supabase match_memories failed: ${matchError.message}`,
      );
    }

    const match = ((matchData ?? []) as MemoryMatch[])[0];

    if (
      match?.memory_id === memory.id &&
      match.similarity >= MIN_SIMILARITY
    ) {
      askedCount += 1;

      if (!lastAskedAt) {
        lastAskedAt = conversation.created_at;
      }
    }
  }

  return { askedCount, lastAskedAt };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const supabase = createSupabaseClient();
    const user = await getAuthenticatedUser(request, supabase);

    if (!user) {
      return Response.json(
        { error: "登录状态已失效，请重新登录。" },
        { status: 401 },
      );
    }

    const memory = await findOwnedMemory(supabase, id, user.id);

    if (!memory) {
      return Response.json(
        { error: "没有找到这条记忆。" },
        { status: 404 },
      );
    }

    const { askedCount, lastAskedAt } = await countMemoryQuestions(
      supabase,
      memory,
    );

    return Response.json({
      memory: {
        id: memory.id,
        content: memory.content,
        emotion: memory.emotion,
        entities: memory.entities,
        source: memory.source,
        created_at: memory.created_at,
        askedCount,
        lastAskedAt,
      },
    });
  } catch (error) {
    console.error("Memory detail API error:", error);

    return Response.json(
      { error: describeApiFailure(error, "读取记忆详情失败，请稍后重试。") },
      { status: 500 },
    );
  }
}