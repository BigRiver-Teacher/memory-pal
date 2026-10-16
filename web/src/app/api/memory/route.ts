import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmartClient } from "supadns-js";
import { describeApiFailure } from "@/lib/server-env";

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
  confidence: number | null;
  source_text: string | null;
  source_offset: number | null;
};

type MemoryMetadata = {
  emotion: string;
  entities: string[];
  confidence: number;
  source_text: string;
  source_offset: number;
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



type OwnedMemory = {
  id: string;
  patient_id: string;
};
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
            "你是严格的结构化记忆提取器。只输出 json 对象，不要输出 markdown。" +
            "JSON Schema 必须为：" +
            '{"entities":[],"emotion":"","confidence":0.0,"source_text":""}。' +
            "entities 是人物、地点、事件、物品等关键词数组。" +
            "每个 entity 都必须是原文中连续出现的文字，不得推断、改写或补充同义词。" +
            "emotion 是原文明确表达的简短情绪词；没有明确情绪时输出空字符串。" +
            "confidence 是 0 到 1 的提取置信度。" +
            "source_text 必须是与输入完全一致的连续原文片段，用于定位记忆来源。",
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
    return {
      emotion: "",
      entities: [],
      confidence: 0,
      source_text: content,
      source_offset: 0,
    };
  }

  const requestedSourceText =
    typeof parsed.source_text === "string"
      ? parsed.source_text.trim()
      : "";
  const sourceText =
    requestedSourceText && content.includes(requestedSourceText)
      ? requestedSourceText
      : content;
  const sourceOffset = Math.max(content.indexOf(sourceText), 0);
  const entities = Array.isArray(parsed.entities)
    ? [
        ...new Set(
          parsed.entities
            .filter((entity): entity is string => typeof entity === "string")
            .map((entity) => entity.trim())
            .filter((entity) => entity && content.includes(entity)),
        ),
      ]
    : [];
  const rawConfidence =
    typeof parsed.confidence === "number"
      ? parsed.confidence
      : Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0;

  return {
    emotion:
      typeof parsed.emotion === "string"
        ? parsed.emotion.trim()
        : "",
    entities,
    confidence,
    source_text: sourceText,
    source_offset: sourceOffset,
  };
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
): Promise<OwnedMemory | null> {
  const { data: memoryData, error: memoryError } = await supabase
    .from("memories")
    .select("id, patient_id")
    .eq("id", memoryId)
    .limit(1);

  if (memoryError) {
    throw new Error(`Supabase memory lookup failed: ${memoryError.message}`);
  }

  const memory = ((memoryData ?? []) as OwnedMemory[])[0];

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

function parseMemoryId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.memoryId !== "string") {
    return null;
  }

  const memoryId = value.memoryId.trim();
  return memoryId || null;
}
async function findExistingMemory(
  supabase: SupabaseClient,
  patientId: string,
  content: string,
): Promise<MemoryRow | null> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, content, created_at, emotion, entities, source, confidence, source_text, source_offset")
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
      .select("id, content, created_at, emotion, entities, source, confidence, source_text, source_offset")
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
      { error: describeApiFailure(error, "读取记忆失败，请稍后重试。") },
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

    if (metadata.confidence < 0.5) {
      return Response.json(
        {
          memory: null,
          pending: true,
          status: "待确认",
          message: "这条记忆置信度较低，已标记为待确认，暂未写入。",
          metadata,
        },
        { status: 202 },
      );
    }

    const embedding = await createEmbedding(body.content);
    const { data, error } = await supabase
      .from("memories")
      .insert({
        patient_id: body.patientId,
        content: body.content,
        embedding,
        emotion: metadata.emotion || null,
        entities: metadata.entities,
        confidence: metadata.confidence,
        source_text: metadata.source_text,
        source_offset: metadata.source_offset,
        source: "family",
      })
      .select("id, content, created_at, emotion, entities, source, confidence, source_text, source_offset")
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
      { error: describeApiFailure(error, "保存记忆失败，请稍后重试。") },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown;

    if (
      !isRecord(body) ||
      typeof body.memoryId !== "string" ||
      !body.memoryId.trim() ||
      typeof body.content !== "string" ||
      !body.content.trim()
    ) {
      return Response.json(
        { error: "请求参数必须包含 memoryId 和 content。" },
        { status: 400 },
      );
    }

    const memoryId = body.memoryId.trim();
    const content = body.content.trim();
    const supabase = createSupabaseClient();
    const user = await getAuthenticatedUser(request, supabase);

    if (!user) {
      return Response.json(
        { error: "登录状态已失效，请重新登录。" },
        { status: 401 },
      );
    }

    const ownedMemory = await findOwnedMemory(
      supabase,
      memoryId,
      user.id,
    );

    if (!ownedMemory) {
      return Response.json(
        { error: "无权编辑这条记忆。" },
        { status: 403 },
      );
    }

    const metadata = await extractMemoryMetadata(content);

    if (metadata.confidence < 0.5) {
      return Response.json(
        {
          memory: null,
          pending: true,
          status: "待确认",
          message: "这条记忆置信度较低，已标记为待确认，暂未更新。",
          metadata,
        },
        { status: 202 },
      );
    }

    const embedding = await createEmbedding(content);
    const { data, error } = await supabase
      .from("memories")
      .update({
        content,
        embedding,
        emotion: metadata.emotion || null,
        entities: metadata.entities,
        confidence: metadata.confidence,
        source_text: metadata.source_text,
        source_offset: metadata.source_offset,
      })
      .eq("id", memoryId)
      .select("id, content, created_at, emotion, entities, source, confidence, source_text, source_offset")
      .single();

    if (error) {
      throw new Error(`Supabase memory update failed: ${error.message}`);
    }

    return Response.json({ memory: data as MemoryRow });
  } catch (error) {
    console.error("Memory PUT API error:", error);

    return Response.json(
      { error: describeApiFailure(error, "更新记忆失败，请稍后重试。") },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown;
    const memoryId = parseMemoryId(body);

    if (!memoryId) {
      return Response.json(
        { error: "请求参数必须包含 memoryId。" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseClient();
    const user = await getAuthenticatedUser(request, supabase);

    if (!user) {
      return Response.json(
        { error: "登录状态已失效，请重新登录。" },
        { status: 401 },
      );
    }

    const ownedMemory = await findOwnedMemory(
      supabase,
      memoryId,
      user.id,
    );

    if (!ownedMemory) {
      return Response.json(
        { error: "无权删除这条记忆。" },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", memoryId);

    if (error) {
      throw new Error(`Supabase memory delete failed: ${error.message}`);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Memory DELETE API error:", error);

    return Response.json(
      { error: describeApiFailure(error, "删除记忆失败，请稍后重试。") },
      { status: 500 },
    );
  }
}