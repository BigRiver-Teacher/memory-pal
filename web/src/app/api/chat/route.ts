import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const SILICONFLOW_EMBEDDINGS_URL =
  "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-m3";
const EXPECTED_DIMENSION = 1024;

const MAX_REPLY_LENGTH = 50;
const MAX_REPLY_ATTEMPTS = 3;
const FALLBACK_REPLY =
  "我不太记得这件事，您可以跟我多说说吗？";

const FORBIDDEN_WORDS = ["过世", "去世", "走了"];
const SPECULATION_WORDS = [
  "可能",
  "应该",
  "大概",
  "也许",
  "或许",
  "似乎",
  "说不定",
  "估计",
  "恐怕",
  "没准",
];
const TESTING_QUESTION_PATTERNS = [
  "还记得我是谁",
  "知道我是谁",
  "知道今天几号",
  "记得今天几号",
];

type ChatRequestBody = {
  patientId: string;
  message: string;
};

type MemoryMatch = {
  content: string;
  similarity: number;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
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

function parseChatRequestBody(value: unknown): ChatRequestBody | null {
  if (!isRecord(value)) {
    return null;
  }

  const patientId = value.patientId;
  const message = value.message;

  if (
    typeof patientId !== "string" ||
    !patientId.trim() ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    return null;
  }

  return {
    patientId: patientId.trim(),
    message: message.trim(),
  };
}

function buildSystemPrompt(memories: MemoryMatch[]): string {
  const memoryBlock = memories
    .map((memory) => `- ${memory.content}`)
    .join("\n");

  return (
    "你是一个温和、克制的陪伴助手。\n" +
    "以下是从患者记忆中检索到的内容，回复时只能依据这些内容：\n" +
    `${memoryBlock}\n\n` +
    "请严格遵守以下要求：\n" +
    "1. 用温和确认的语气回复患者。\n" +
    "2. 不得编造记忆中没有的信息，不得补充不存在的事实、动机、情感或当前行踪。\n" +
    "3. 不得追问患者，也不得提出测试性问题。\n" +
    "4. 允许温和的引导式提问，例如“能跟我说说你们以前常做的事吗？”，" +
    "但禁止测试性提问，例如“您还记得我是谁吗？”“您知道今天几号吗？”。" +
    "每句回复最多只能包含一个问号。\n" +
    "5. 不得出现“过世”“去世”“走了”等词。\n" +
    "6. 不得使用“可能”“应该”“大概”“也许”“或许”等推测词。\n" +
    `7. 回复不能超过 ${MAX_REPLY_LENGTH} 个字。\n` +
    "只输出最终回复，不要解释。"
  );
}

function countQuestionMarks(reply: string): number {
  return (reply.match(/[?？]/g) ?? []).length;
}

function isAcceptableReply(reply: string): boolean {
  if (!reply || reply.length > MAX_REPLY_LENGTH) {
    return false;
  }

  if (countQuestionMarks(reply) > 1) {
    return false;
  }

  if (
    TESTING_QUESTION_PATTERNS.some((pattern) =>
      reply.includes(pattern),
    )
  ) {
    return false;
  }

  if (FORBIDDEN_WORDS.some((word) => reply.includes(word))) {
    return false;
  }

  if (SPECULATION_WORDS.some((word) => reply.includes(word))) {
    return false;
  }

  return true;
}

async function createEmbedding(
  message: string,
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
      input: message,
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

async function retrieveMemories(
  supabase: SupabaseClient,
  patientId: string,
  queryEmbedding: number[],
): Promise<MemoryMatch[]> {
  const { data, error } = await supabase.rpc("match_memories", {
    p_patient_id: patientId,
    p_query_embedding: queryEmbedding,
    p_match_count: 2,
  });

  if (error) {
    throw new Error(`Supabase match_memories failed: ${error.message}`);
  }

  return (data ?? []) as MemoryMatch[];
}

async function requestDeepSeekReply(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Invalid DeepSeek response");
  }

  return content;
}

async function generateReply(
  apiKey: string,
  patientMessage: string,
  memories: MemoryMatch[],
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(memories),
    },
    {
      role: "user",
      content: patientMessage,
    },
  ];

  for (let attempt = 0; attempt < MAX_REPLY_ATTEMPTS; attempt += 1) {
    const reply = await requestDeepSeekReply(apiKey, messages);

    if (isAcceptableReply(reply)) {
      return reply;
    }

    if (attempt + 1 < MAX_REPLY_ATTEMPTS) {
      messages.push(
        {
          role: "assistant",
          content: reply,
        },
        {
          role: "user",
          content:
            "上面的回复不符合要求。请重新生成一句回复。" +
            "必须温和确认，只依据检索到的记忆，不得编造。" +
            "最多只能有一个引导式问号，禁止测试性提问。" +
            `不能超过 ${MAX_REPLY_LENGTH} 个字，只输出回复本身。`,
        },
      );
    }
  }

  throw new Error("DeepSeek did not return an acceptable reply");
}

async function saveConversation(
  supabase: SupabaseClient,
  patientId: string,
  patientMessage: string,
  reply: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .insert([
      {
        patient_id: patientId,
        role: "user",
        content: patientMessage,
      },
      {
        patient_id: patientId,
        role: "assistant",
        content: reply,
      },
    ]);

  if (error) {
    throw new Error(`Supabase conversation insert failed: ${error.message}`);
  }
}

function isTestModeEnabled(): boolean {
  return process.env.TEST_MODE?.trim().toLowerCase() === "true";
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseChatRequestBody(await request.json());

    if (!body) {
      return Response.json(
        { error: "请求参数必须包含 patientId 和 message。" },
        { status: 400 },
      );
    }

    const deepseekApiKey = getRequiredEnv("DEEPSEEK_API_KEY");
    const siliconflowApiKey = getRequiredEnv("SILICONFLOW_API_KEY");
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const queryEmbedding = await createEmbedding(
      body.message,
      siliconflowApiKey,
    );
    const memories = await retrieveMemories(
      supabase,
      body.patientId,
      queryEmbedding,
    );

    const reply =
      memories.length === 0
        ? FALLBACK_REPLY
        : await generateReply(
            deepseekApiKey,
            body.message,
            memories,
          );

    if (!isTestModeEnabled()) {
      await saveConversation(
        supabase,
        body.patientId,
        body.message,
        reply,
      );
    }

    return Response.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);

    return Response.json(
      { error: "生成回复失败，请稍后重试。" },
      { status: 500 },
    );
  }
}