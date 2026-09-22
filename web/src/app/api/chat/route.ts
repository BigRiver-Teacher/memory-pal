import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmartClient } from "supadns-js";

export const runtime = "nodejs";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const SILICONFLOW_EMBEDDINGS_URL =
  "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-m3";
const EXPECTED_DIMENSION = 1024;

const MAX_REPLY_LENGTH = 50;
const MAX_REPLY_ATTEMPTS = 3;
const MIN_SIMILARITY = 0.5;
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

function formatCurrentDateTime(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function isDateTimeQuestion(message: string): boolean {
  return /几号|星期几|周几|几点|什么时候|时间|节日|中秋|春节|国庆/.test(
    message,
  );
}

function buildSystemPrompt(memories: MemoryMatch[]): string {
  const currentDateTime = formatCurrentDateTime();
  const memoryBlock =
    memories.length > 0
      ? memories.map((memory) => `- ${memory.content}`).join("\n")
      : "没有检索到相关记忆。";

  return (
    "你是一个温和、克制的陪伴助手。\n" +
    `当前时间是 ${currentDateTime}。\n\n` +
    "以下是从长辈记忆中检索到的内容：" +
    "\n" +
    `${memoryBlock}\n\n` +
    "请严格遵守以下要求：\n" +
    "1. 用温和确认的语气回复长辈。\n" +
    "2. 如果长辈问今天几号、星期几，直接根据“当前时间”回答，不要使用检索到的记忆。\n" +
    "最近对话只用于理解当前问题，不要主动复述历史。\n" +
    "3. 不得编造记忆中没有的信息，不得补充不存在的事实、动机、情感或当前行踪。\n" +
    "4. 不得要求长辈证明记忆或回答身份、时间类测试问题。\n" +
    "5. 允许温和的引导式提问，例如“能跟我说说你们以前常做的事吗？”，" +
    "但禁止测试性提问，例如“您还记得我是谁吗？”“您知道今天几号吗？”。" +
    "每句回复最多只能包含一个问号。\n" +
    "6. 不得出现“过世”“去世”“走了”等词。\n" +
    "7. 不得使用“可能”“应该”“大概”“也许”“或许”等推测词。\n" +
    `8. 回复不能超过 ${MAX_REPLY_LENGTH} 个字。\n` +
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

type ConversationHistoryRow = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

async function getRecentConversationContext(
  supabase: SupabaseClient,
  patientId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content, created_at")
    .eq("patient_id", patientId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    throw new Error(
      `Supabase conversation context query failed: ${error.message}`,
    );
  }

  return ((data ?? []) as ConversationHistoryRow[])
    .slice()
    .reverse()
    .map((conversation) => ({
      role: conversation.role,
      content: conversation.content,
    }));
}

function formatConversationContext(
  conversationHistory: ChatMessage[],
): string {
  if (conversationHistory.length === 0) {
    return "无";
  }

  return conversationHistory
    .map((message) => {
      const speaker = message.role === "user" ? "长辈" : "忆伴";
      return `${speaker}：${message.content}`;
    })
    .join("\n");
}

function contextSuggestsDateTime(
  message: string,
  conversationHistory: ChatMessage[],
): boolean {
  if (message.trim().length > 8) {
    return false;
  }

  return conversationHistory
    .slice(-4)
    .some((historyMessage) =>
      isDateTimeQuestion(historyMessage.content),
    );
}
async function retrieveMemories(
  supabase: SupabaseClient,
  patientId: string,
  queryEmbedding: number[],
): Promise<MemoryMatch[]> {
  const { data, error } = await supabase.rpc("match_memories", {
    p_patient_id: patientId,
    p_query_embedding: queryEmbedding,
    p_match_count: 5,
  });

  if (error) {
    throw new Error(`Supabase match_memories failed: ${error.message}`);
  }

  return ((data ?? []) as MemoryMatch[]).filter(
    (memory) =>
      typeof memory.similarity === "number" &&
      memory.similarity >= MIN_SIMILARITY,
  );
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

async function requestDeepSeekJson(
  apiKey: string,
  messages: ChatMessage[],
): Promise<unknown> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek JSON request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Invalid DeepSeek JSON response");
  }

  return JSON.parse(content) as unknown;
}

async function classifyPatientIntent(
  apiKey: string,
  message: string,
  conversationHistory: ChatMessage[],
): Promise<"memory" | "story" | "datetime" | "other"> {
  const contextText = formatConversationContext(conversationHistory);
  const result = await requestDeepSeekJson(apiKey, [
    {
      role: "system",
      content:
        "你负责判断长辈话语的意图，并且只输出 json 对象。" +
        '格式必须是 {"intent":"memory"}、{"intent":"story"}、' +
        '{"intent":"datetime"} 或 {"intent":"other"}。' +
        "如果长辈在确认一段记忆，输出 memory。" +
        "如果长辈在主动讲述过去经历、故事或生活片段，输出 story。" +
        "如果长辈在询问日期、星期、时间、节日日期或倒计时，输出 datetime。" +
        "如果当前输入是省略句，要结合最近对话判断意图。" +
        "其他情况输出 other。" +
        `\n最近对话：\n${contextText}`,
    },
    {
      role: "user",
      content: message,
    },
  ]);

  if (
    isRecord(result) &&
    (result.intent === "memory" ||
      result.intent === "story" ||
      result.intent === "datetime" ||
      result.intent === "other")
  ) {
    return result.intent;
  }

  return isDateTimeQuestion(message) ||
    contextSuggestsDateTime(message, conversationHistory)
    ? "datetime"
    : "other";
}

async function generateDateTimeReply(
  apiKey: string,
  message: string,
  conversationHistory: ChatMessage[],
): Promise<string> {
  return requestDeepSeekReply(apiKey, [
    {
      role: "system",
      content:
        `当前时间是 ${formatCurrentDateTime()}。` +
        "你正在直接回答时间、日期或节日相关问题。" +
        "请用温和、简短、口语化的方式回答，不超过 50 个字。" +
        "不要检索或引用长辈记忆。" +
        "最近对话只用于理解当前省略句，不要主动复述历史。" +
        "对于节日类问题，如果无法准确确认具体日期，" +
        "必须回答“这个我记不太清了，您可以问问家里人”，不要编造日期。",
    },
    ...conversationHistory,
    {
      role: "user",
      content: message,
    },
  ]);
}

async function extractMemoryAnchors(
  apiKey: string,
  message: string,
): Promise<{ entities: string[]; emotion: string }> {
  const result = await requestDeepSeekJson(apiKey, [
    {
      role: "system",
      content:
        "请从长辈讲述中提取记忆锚点，并且只输出 json 对象。" +
        '格式必须是 {"entities": [], "emotion": ""}。' +
        "entities 是人物、地点、事件、物品等关键词数组，emotion 是情绪词。",
    },
    {
      role: "user",
      content: message,
    },
  ]);

  if (!isRecord(result)) {
    return { entities: [], emotion: "" };
  }

  const entities = Array.isArray(result.entities)
    ? result.entities.filter(
        (entity): entity is string => typeof entity === "string",
      )
    : [];
  const emotion =
    typeof result.emotion === "string" ? result.emotion : "";

  return { entities, emotion };
}

async function storeStoryMemory(
  supabase: SupabaseClient,
  patientId: string,
  message: string,
  embedding: number[],
  metadata: { entities: string[]; emotion: string },
): Promise<void> {
  const { data, error: selectError } = await supabase
    .from("memories")
    .select("id")
    .eq("patient_id", patientId)
    .eq("content", message)
    .limit(1);

  if (selectError) {
    throw new Error(
      `Supabase memory lookup failed: ${selectError.message}`,
    );
  }

  if (data && data.length > 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("memories")
    .insert({
      patient_id: patientId,
      content: message,
      embedding,
      emotion: metadata.emotion || null,
      entities: metadata.entities,
      source: "patient",
    });

  if (insertError) {
    throw new Error(
      `Supabase memory insert failed: ${insertError.message}`,
    );
  }
}
async function generateReply(
  apiKey: string,
  patientMessage: string,
  memories: MemoryMatch[],
  conversationHistory: ChatMessage[],
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(memories),
    },
    ...conversationHistory,
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

    const supabase = createSmartClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const isTestMode = isTestModeEnabled();
    const conversationHistory = await getRecentConversationContext(
      supabase,
      body.patientId,
    );
    const classifiedIntent = await classifyPatientIntent(
      deepseekApiKey,
      body.message,
      conversationHistory,
    );
    const intent =
      isDateTimeQuestion(body.message) ||
      contextSuggestsDateTime(body.message, conversationHistory)
        ? "datetime"
        : classifiedIntent;

    if (intent === "datetime") {
      const reply = await generateDateTimeReply(
        deepseekApiKey,
        body.message,
        conversationHistory,
      );

      if (!isTestMode) {
        await saveConversation(
          supabase,
          body.patientId,
          body.message,
          reply,
        );
      }

      return Response.json({ reply });
    }

    const queryEmbedding = await createEmbedding(
      body.message,
      siliconflowApiKey,
    );

    if (intent === "story") {
      const metadata = await extractMemoryAnchors(
        deepseekApiKey,
        body.message,
      );

      if (!isTestMode) {
        await storeStoryMemory(
          supabase,
          body.patientId,
          body.message,
          queryEmbedding,
          metadata,
        );
      }
    }

    const memories = await retrieveMemories(
      supabase,
      body.patientId,
      queryEmbedding,
    );
    const reply =
      memories.length > 0
        ? await generateReply(
            deepseekApiKey,
            body.message,
            memories,
            conversationHistory,
          )
        : FALLBACK_REPLY;

    if (!isTestMode) {
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