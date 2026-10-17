import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmartClient } from "supadns-js";
import { describeApiFailure } from "@/lib/server-env";

export const runtime = "nodejs";

const QWEN_MODEL_DEFAULT = "qwen-plus";

function getQwenApiUrl(): string {
  const baseUrl = getRequiredEnv("QWEN_BASE_URL").replace(/\/+$/, "");
  return `${baseUrl}/chat/completions`;
}

function getQwenModel(): string {
  return process.env.QWEN_MODEL?.trim() || QWEN_MODEL_DEFAULT;
}

const SILICONFLOW_EMBEDDINGS_URL =
  "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-m3";
const EXPECTED_DIMENSION = 1024;

const MAX_REPLY_LENGTH = 100;
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
const LOCATION_ENTITY_WORDS = [
  "南京",
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "苏州",
  "成都",
  "重庆",
  "西安",
  "武汉",
  "天津",
  "老家",
  "家里",
  "学校",
  "医院",
  "公园",
];
const PERSON_ENTITY_WORDS = [
  "女儿",
  "儿子",
  "孙子",
  "孙女",
  "老伴",
  "妻子",
  "丈夫",
  "妈妈",
  "爸爸",
  "小芳",
  "老师",
  "学生",
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

type PatientIntent =
  | "location"
  | "person"
  | "memory"
  | "story"
  | "datetime"
  | "other";

type MemoryMatch = {
  memory_id: string;
  content: string;
  similarity: number;
  confidence: number | null;
  entities: string[] | null;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type MemoryExtraction = {
  entities: string[];
  emotion: string;
  confidence: number;
  source_text: string;
  source_offset: number;
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

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const WEEKDAY_NAMES_CN = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
];

function getShanghaiToday(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
    ),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateCn(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function formatWeekdayCn(date: Date): string {
  const index = date.getUTCDay() === 0 ? 6 : date.getUTCDay() - 1;
  return WEEKDAY_NAMES_CN[index];
}

// 让模型自行推算"下周是几号到几号"并不可靠（实测会答错），
// 这里在服务端把常用区间算好，作为权威事实交给模型直接引用。
function buildDateFacts(now: Date): string {
  const today = getShanghaiToday(now);
  const mondayOffset = today.getUTCDay() === 0 ? 6 : today.getUTCDay() - 1;
  const thisMonday = addDays(today, -mondayOffset);
  const range = (start: Date) =>
    `${formatDateCn(start)}（周一）至 ${formatDateCn(addDays(start, 6))}（周日）`;

  return [
    `今天是 ${formatDateCn(today)}${formatWeekdayCn(today)}。`,
    `明天是 ${formatDateCn(addDays(today, 1))}，后天是 ${formatDateCn(addDays(today, 2))}，` +
      `昨天是 ${formatDateCn(addDays(today, -1))}，前天是 ${formatDateCn(addDays(today, -2))}。`,
    `本周：${range(thisMonday)}。`,
    `下周：${range(addDays(thisMonday, 7))}。`,
    `上周：${range(addDays(thisMonday, -7))}。`,
    "日期与星期对照：" +
      Array.from({ length: 21 }, (_, offset) => {
        const day = addDays(today, offset);
        return `${formatDateCn(day)}${formatWeekdayCn(day)}`;
      }).join("，"),
  ].join("\n");
}

// 记忆里常出现"10月24日"这类日期，模型自行推星期容易出错，
// 这里统一补上正确星期，让它直接引用。
function annotateMemoryDates(content: string, now: Date): string {
  const today = getShanghaiToday(now);
  const year = today.getUTCFullYear();

  return content.replace(
    /(\d{1,2})月(\d{1,2})[日号]/g,
    (matched, monthText: string, dayText: string) => {
      const month = Number(monthText);
      const day = Number(dayText);
      const date = new Date(Date.UTC(year, month - 1, day));

      if (
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day ||
        Math.abs(date.getTime() - today.getTime()) > 180 * 86400000
      ) {
        return matched;
      }

      return `${matched}（${formatWeekdayCn(date)}）`;
    },
  );
}

function buildMemoryBlock(memories: MemoryMatch[], now: Date): string {
  return memories.length > 0
    ? memories
        .map((memory) => `- ${annotateMemoryDates(memory.content, now)}`)
        .join("\n")
    : "没有检索到相关记忆。";
}
// 明确在问"日期/时间本身"（几号、星期几、几点）的问题只用系统日期作答；
// 其余问题（如"我二儿子什么时候过生日"）仍然必须走记忆检索。
function isExplicitDateQuestion(message: string): boolean {
  return /几号|几月几|星期几|周几|几点|多少号/.test(message);
}
function isDateTimeQuestion(message: string): boolean {
  return /几号|星期几|周几|几点|什么时候|时间|节日|中秋|春节|国庆/.test(
    message,
  );
}

function buildSystemPrompt(memories: MemoryMatch[]): string {
  const currentDateTime = formatCurrentDateTime();
  const memoryBlock = buildMemoryBlock(memories, new Date());

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
    "8. 如果识别到用户情绪是孤独、怀念、悲伤，允许在回复末尾加一句温和的主动关心，" +
    "例如“今天阳光挺好的，要不要去窗边坐坐”“我陪您待一会儿”。" +
    "主动关心不计入问号数量限制。\n" +
    `9. 回复不能超过 ${MAX_REPLY_LENGTH} 个字。\n` +
    "10. 如果长辈问的是自己近期的安排或计划，而检索到的记忆里有多条相关条目，" +
    "请在字数限制内逐条简要列出，不要只挑一条。\n" +
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

// 长辈讲述自身经历或生活片段时出现的时间、事件锚点。
const NARRATION_TIME_PATTERN =
  /以前|年轻|小时候|当年|当时|曾经|那天|上次|前些天|昨天|前天|今天|早上|上午|中午|下午|晚上|刚才|中秋|春节|国庆|过节|生日/;

// 疑问句标记。只有疑问句才按提问意图处理，否则长辈叙述生活片段的
// 陈述句会被下面的关键词规则抢走，内容就永远写不进记忆。
const QUESTION_MARKER_PATTERN =
  /[?？]|吗|呢|谁|什么|怎么|哪|几|多少|是不是|有没有|对不对|好不好/;

function isQuestion(message: string): boolean {
  return QUESTION_MARKER_PATTERN.test(message);
}

function classifyIntentByRules(
  message: string,
  conversationHistory: ChatMessage[],
): PatientIntent | null {
  const trimmed = message.trim();

  // 陈述式自述优先判定为 story：长辈讲自己的经历或生活片段时，
  // "我女儿昨天来看我了"会被"来看我"误判成人称提问，
  // "我中秋节和儿子一起过的"会被"中秋"误判成问日期，
  // 这些内容原本会绕开记忆写入分支。
  if (
    !isQuestion(trimmed) &&
    /^我/.test(trimmed) &&
    NARRATION_TIME_PATTERN.test(trimmed)
  ) {
    return "story";
  }

  if (/哪去|去哪|在哪|什么地方|哪里|哪儿/.test(trimmed)) {
    return "location";
  }

  if (/谁|叫什么|什么时候来|来看我|会来吗/.test(trimmed)) {
    return "person";
  }

  if (
    isDateTimeQuestion(trimmed) ||
    contextSuggestsDateTime(trimmed, conversationHistory)
  ) {
    return "datetime";
  }

  if (/吃了吗|做了吗|是不是|有没有|干什么|做什么|是什么/.test(trimmed)) {
    return "memory";
  }

  return null;
}

function isLocationEntity(entity: string): boolean {
  return (
    LOCATION_ENTITY_WORDS.some((word) => entity.includes(word)) ||
    /(省|市|区|县|镇|村|路|街|公园|医院|学校|老家)$/.test(entity)
  );
}

function isPersonEntity(entity: string): boolean {
  return PERSON_ENTITY_WORDS.some(
    (word) => entity.includes(word) || word.includes(entity),
  );
}

// Memories written before the extraction schema existed have no entities.
// Falling back to the content keeps them retrievable instead of silently
// dropping them from location and person questions.
function getMemoryEntityTerms(memory: MemoryMatch): string[] {
  if (memory.entities && memory.entities.length > 0) {
    return memory.entities;
  }

  return [memory.content];
}

function filterMemoriesByIntent(
  memories: MemoryMatch[],
  intent: PatientIntent,
): MemoryMatch[] {
  if (intent !== "location" && intent !== "person") {
    return memories;
  }

  const matches = memories.filter((memory) =>
    getMemoryEntityTerms(memory).some(
      intent === "location" ? isLocationEntity : isPersonEntity,
    ),
  );

  // 实体过滤只用于"优先挑出对得上的记忆"。如果一条都没对上
  // （例如"我大学同学呢"里的"大学同学"不在词表内），就保留全部
  // 检索结果，否则会把本来能回答的记忆整批丢掉，退化成兜底回复。
  return matches.length > 0 ? matches : memories;
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

  const relevantMemories = (
    (data ?? []) as Array<{
      memory_id: string;
      content: string;
      similarity: number;
    }>
  ).filter(
    (memory) =>
      typeof memory.similarity === "number" &&
      memory.similarity >= MIN_SIMILARITY,
  );

  if (relevantMemories.length === 0) {
    return [];
  }

  const memoryIds = relevantMemories.map((memory) => memory.memory_id);
  const { data: confidenceData, error: confidenceError } =
    await supabase
      .from("memories")
      .select("id, confidence, entities")
      .in("id", memoryIds);

  if (confidenceError) {
    throw new Error(
      `Supabase memory confidence query failed: ${confidenceError.message}`,
    );
  }

  const confidenceById = new Map(
    (
      (confidenceData ?? []) as Array<{
        id: string;
        confidence: number | null;
        entities: string[] | null;
      }>
    ).map((memory) => [memory.id, memory]),
  );

  return relevantMemories
    .map((memory) => {
      const metadata = confidenceById.get(memory.memory_id);
      return {
        ...memory,
        confidence: metadata?.confidence ?? null,
        entities: metadata?.entities ?? null,
      };
    })
    .filter((memory) => {
      if (memory.confidence !== null) {
        return memory.confidence >= 0.5;
      }

      return memory.similarity >= 0.5;
    })
    .sort((left, right) => {
      const leftPreferred =
        left.confidence !== null && left.confidence > 0.7 ? 1 : 0;
      const rightPreferred =
        right.confidence !== null && right.confidence > 0.7 ? 1 : 0;

      return (
        rightPreferred - leftPreferred ||
        right.similarity - left.similarity
      );
    });
}

async function requestQwenReply(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(getQwenApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getQwenModel(),
      messages,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Qwen request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Invalid Qwen response");
  }

  return content;
}

async function requestQwenJson(
  apiKey: string,
  messages: ChatMessage[],
): Promise<unknown> {
  const response = await fetch(getQwenApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getQwenModel(),
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Qwen JSON request failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Invalid Qwen JSON response");
  }

  return JSON.parse(content) as unknown;
}

async function classifyPatientIntent(
  apiKey: string,
  message: string,
  conversationHistory: ChatMessage[],
): Promise<PatientIntent> {
  const contextText = formatConversationContext(conversationHistory);
  const result = await requestQwenJson(apiKey, [
    {
      role: "system",
      content:
        "你负责判断长辈话语的意图，并且只输出 json 对象。" +
        '格式必须是 {"intent":"location"}、{"intent":"person"}、' +
        '{"intent":"memory"}、{"intent":"story"}、' +
        '{"intent":"datetime"} 或 {"intent":"other"}。' +
        "如果长辈在询问地点，输出 location。" +
        "如果长辈在询问某个人、姓名或某人何时来，输出 person。" +
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
    (result.intent === "location" ||
      result.intent === "person" ||
      result.intent === "memory" ||
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
  memories: MemoryMatch[] = [],
): Promise<string> {
  const memoryBlock = buildMemoryBlock(memories, new Date());

  return requestQwenReply(apiKey, [
    {
      role: "system",
      content:
        `当前时间是 ${formatCurrentDateTime()}。\n` +
        "【系统计算的日期，必须严格使用，禁止自行推算或改写】\n" +
        `${buildDateFacts(new Date())}\n\n` +
        "【检索到的长辈记忆】\n" +
        `${memoryBlock}\n\n` +
        "【最高优先级】如果问的是长辈近期有什么安排、计划或日程，" +
        "必须把【检索到的长辈记忆】里的每一条都按时间顺序列出来，" +
        "用分号隔开，一条都不能省略；" +
        "禁止在还有条目时声称“没有其他安排”或“查不到”。\n\n" +
        "其余情况请遵守以下要求：\n" +
        "1. 问今天几号、星期几、现在几点、本周或下周是几号到几号时，" +
        "必须直接引用【系统计算的日期】，不得自行推算。\n" +
        "2. 问长辈自己或家人的具体安排、生日、来访、过节计划时，" +
        "必须依据【检索到的长辈记忆】回答；记忆里没有就回答" +
        "“这个我记不太清了，您可以问问家里人”，不要编造。\n" +
        `3. 用温和、简短、口语化的方式回答，不超过 ${MAX_REPLY_LENGTH} 个字。\n` +
        "4. 问长辈近期安排或计划时，必须把【检索到的长辈记忆】里所有相关条目" +
        "按时间顺序逐条简要列出，一条都不能漏；不要只挑一条，" +
        "也不要编造未检索到的内容。\n" +
        "5. 最近对话只用于理解当前省略句，不要主动复述历史。",
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
): Promise<MemoryExtraction> {
  const result = await requestQwenJson(apiKey, [
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
      content: message,
    },
  ]);

  if (!isRecord(result)) {
    return {
      entities: [],
      emotion: "",
      confidence: 0,
      source_text: message,
      source_offset: 0,
    };
  }

  const requestedSourceText =
    typeof result.source_text === "string"
      ? result.source_text.trim()
      : "";
  const sourceText =
    requestedSourceText && message.includes(requestedSourceText)
      ? requestedSourceText
      : message;
  const sourceOffset = Math.max(message.indexOf(sourceText), 0);
  const entities = Array.isArray(result.entities)
    ? [
        ...new Set(
          result.entities
            .filter((entity): entity is string => typeof entity === "string")
            .map((entity) => entity.trim())
            .filter((entity) => entity && message.includes(entity)),
        ),
      ]
    : [];
  const rawConfidence =
    typeof result.confidence === "number"
      ? result.confidence
      : Number(result.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0;

  return {
    entities,
    emotion:
      typeof result.emotion === "string" ? result.emotion.trim() : "",
    confidence,
    source_text: sourceText,
    source_offset: sourceOffset,
  };
}

async function storeStoryMemory(
  supabase: SupabaseClient,
  patientId: string,
  message: string,
  embedding: number[],
  metadata: MemoryExtraction,
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
      confidence: metadata.confidence,
      source_text: metadata.source_text,
      source_offset: metadata.source_offset,
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
    const reply = await requestQwenReply(apiKey, messages);

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

    const qwenApiKey = getRequiredEnv("QWEN_API_KEY");
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
    let memoryPending = false;
    const conversationHistory = await getRecentConversationContext(
      supabase,
      body.patientId,
    );
    const ruleIntent = classifyIntentByRules(
      body.message,
      conversationHistory,
    );
    const classifiedIntent =
      ruleIntent ??
      (await classifyPatientIntent(
        qwenApiKey,
        body.message,
        conversationHistory,
      ));
    const intent = ruleIntent ?? classifiedIntent;

    if (intent === "datetime") {
      // 纯日期问题（几号、星期几、几点）只用系统日期作答；
      // 其余（生日、来访、过节计划、近期安排）必须带上记忆，
      // 否则家属录入的记忆在这条分支上永远不会被用到。
      let dateQuestionMemories: MemoryMatch[] = [];

      if (!isExplicitDateQuestion(body.message)) {
        const dateQueryEmbedding = await createEmbedding(
          body.message,
          siliconflowApiKey,
        );
        dateQuestionMemories = await retrieveMemories(
          supabase,
          body.patientId,
          dateQueryEmbedding,
        );
      }


      const reply = await generateDateTimeReply(
        qwenApiKey,
        body.message,
        conversationHistory,
        dateQuestionMemories,
      );

      if (!isTestMode) {
        await saveConversation(
          supabase,
          body.patientId,
          body.message,
          reply,
        );
      }

      return Response.json({
      reply,
      ...(memoryPending
        ? {
            memoryPending: true,
            status: "待确认",
          }
        : {}),
    });
    }

    const queryEmbedding = await createEmbedding(
      body.message,
      siliconflowApiKey,
    );

    if (intent === "story") {
      const metadata = await extractMemoryAnchors(
        qwenApiKey,
        body.message,
      );

      if (!isTestMode) {
        if (metadata.confidence >= 0.5) {
          await storeStoryMemory(
            supabase,
            body.patientId,
            body.message,
            queryEmbedding,
            metadata,
          );
        } else {
          memoryPending = true;
        }
      }
    }

    const memories = await retrieveMemories(
      supabase,
      body.patientId,
      queryEmbedding,
    );
    const filteredMemories = filterMemoriesByIntent(memories, intent);

    const reply =
      filteredMemories.length > 0
        ? await generateReply(
            qwenApiKey,
            body.message,
            filteredMemories,
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

    return Response.json({
      reply,
      ...(memoryPending
        ? {
            memoryPending: true,
            status: "待确认",
          }
        : {}),
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return Response.json(
      { error: describeApiFailure(error, "生成回复失败，请稍后重试。") },
      { status: 500 },
    );
  }
}