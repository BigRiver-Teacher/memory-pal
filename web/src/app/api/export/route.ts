import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ExportType = "memory" | "conversation" | "report" | "all";

type PatientRow = {
  id: string;
  name: string;
};

type MemoryRow = {
  content: string;
  emotion: string | null;
  created_at: string;
};

type ConversationRow = {
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type ReportRow = {
  report_date: string;
  advice: string;
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

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\//g, "-");
}

function cleanMarkdownLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildMarkdown(
  patientName: string,
  type: ExportType,
  memories: MemoryRow[],
  conversations: ConversationRow[],
  reports: ReportRow[],
): string {
  const sections: string[] = [
    "# 忆伴 · 长辈数据导出",
    "",
    `长辈：${patientName}`,
    `导出时间：${formatDateTime(new Date().toISOString())}`,
  ];

  if (type === "memory" || type === "all") {
    sections.push("", "## 记忆列表", "");

    if (memories.length === 0) {
      sections.push("暂无记忆记录");
    } else {
      sections.push(
        ...memories.map((memory) => {
          const emotion = memory.emotion?.trim();
          const emotionText = emotion ? `（情绪：${emotion}）` : "";
          return `- [${formatDate(memory.created_at)}] ${cleanMarkdownLine(memory.content)}${emotionText}`;
        }),
      );
    }
  }

  if (type === "conversation" || type === "all") {
    sections.push("", "## 对话记录", "");

    if (conversations.length === 0) {
      sections.push("暂无对话记录");
    } else {
      sections.push(
        ...conversations.map((conversation) => {
          const speaker =
            conversation.role === "user"
              ? "长辈"
              : conversation.role === "assistant"
                ? "忆伴"
                : "系统";
          return `- [${formatDateTime(conversation.created_at)}] ${speaker}：${cleanMarkdownLine(conversation.content)}`;
        }),
      );
    }
  }

  if (type === "report" || type === "all") {
    sections.push("", "## 日报记录", "");

    if (reports.length === 0) {
      sections.push("暂无日报记录");
    } else {
      sections.push(
        ...reports.map(
          (report) =>
            `- [${report.report_date}] ${cleanMarkdownLine(report.advice)}`,
        ),
      );
    }
  }

  return `${sections.join("\n")}\n`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patientId")?.trim();
    const type = url.searchParams.get("type")?.trim() as
      | ExportType
      | undefined;

    if (!patientId || !type) {
      return Response.json(
        { error: "缺少 patientId 或 type 参数。" },
        { status: 400 },
      );
    }

    if (!["memory", "conversation", "report", "all"].includes(type)) {
      return Response.json(
        { error: "type 参数必须是 memory、conversation、report 或 all。" },
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

    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, name")
      .eq("id", patientId)
      .eq("owner_id", user.id)
      .limit(1);

    if (patientError) {
      throw new Error(`Supabase patient query failed: ${patientError.message}`);
    }

    const patient = ((patientData ?? []) as PatientRow[])[0];

    if (!patient) {
      return Response.json(
        { error: "无权导出该长辈的数据。" },
        { status: 403 },
      );
    }

    const shouldLoadMemories = type === "memory" || type === "all";
    const shouldLoadConversations =
      type === "conversation" || type === "all";
    const shouldLoadReports = type === "report" || type === "all";

    const [memoryResponse, conversationResponse, reportResponse] =
      await Promise.all([
        shouldLoadMemories
          ? supabase
              .from("memories")
              .select("content, emotion, created_at")
              .eq("patient_id", patientId)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        shouldLoadConversations
          ? supabase
              .from("conversations")
              .select("role, content, created_at")
              .eq("patient_id", patientId)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        shouldLoadReports
          ? supabase
              .from("reports")
              .select("report_date, advice")
              .eq("patient_id", patientId)
              .order("report_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
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

    if (reportResponse.error) {
      throw new Error(
        `Supabase reports query failed: ${reportResponse.error.message}`,
      );
    }

    const markdown = buildMarkdown(
      patient.name,
      type,
      (memoryResponse.data ?? []) as MemoryRow[],
      (conversationResponse.data ?? []) as ConversationRow[],
      (reportResponse.data ?? []) as ReportRow[],
    );

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export API error:", error);

    return Response.json(
      { error: "导出长辈数据失败，请稍后重试。" },
      { status: 500 },
    );
  }
}