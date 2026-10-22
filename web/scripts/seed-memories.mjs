#!/usr/bin/env node
// 给某个长辈批量写入记忆，并顺带跑一轮问答自检。
//
// 为什么用 HTTP 而不是直连数据库：
//   写入记忆必须同时生成 1024 维 embedding（SiliconFlow）并做结构化元数据
//   提取（DeepSeek），这两把 key 只在服务端存在。/api/memory 已经封装好了
//   完整链路，脚本直接复用它，避免在本地复制一份 embedding / 提取逻辑。
//
// 用法：
//   node scripts/seed-memories.mjs                    # 写入 + 自检
//   node scripts/seed-memories.mjs --dry-run          # 只打印计划，不写库
//   node scripts/seed-memories.mjs --chat-only        # 只跑问答自检，不写记忆
//   node scripts/seed-memories.mjs --patient=大肥鱼
//   node scripts/seed-memories.mjs --site=http://localhost:3000
//
// 幂等：/api/memory 会先按 (patient_id, content) 查重，重复内容返回
// duplicate: true，不会产生重复行，因此脚本可以反复执行。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_SITE_URL = "https://memory-pal-cgb9.vercel.app";
const DEFAULT_SUPABASE_URL = "https://diaxbfqkpvsntjnhpach.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "sb_publishable_u_IsrQkxYjWeJsDgSLQ89A_GwS5h46I";
const DEFAULT_PHONE = "13800000000";
const DEFAULT_PASSWORD = "123456";
const DEFAULT_PATIENT_NAME = "大肥鱼";

// 记忆置信度低于 0.5 时 /api/memory 返回 202 且不写库，脚本需要把这种情况
// 报出来，而不是当成成功。
const PENDING_STATUS = 202;

export const MEMORY_SEEDS = [
  "我叫大肥鱼，今年七十八岁，老家在安徽芜湖。",
  "我老伴叫王桂英，我们是一九七五年结的婚。",
  "我女儿叫李小敏，住在南京，每个星期天都来看我。",
  "我儿子叫李大勇，在苏州开了一家汽修铺。",
  "我孙子叫李念，今年上小学四年级。",
  "我孙女叫李彤，特别爱画画，墙上贴的都是她的画。",
  "我年轻的时候在芜湖老家的小学当老师，教了三十年语文。",
  "我以前教过一个学生叫张建国，后来他当了医生。",
  "我们一家人搬来南京已经二十多年了。",
  "我每个星期天都和女儿去玄武湖公园散步。",
  "我每天早上去小区门口的公园打太极，认识了老周和老陈。",
  "我下午喜欢和老周在楼下下象棋，他下不过我。",
  "我最爱吃红烧狮子头，女儿做的最好吃。",
  "我血糖有点高，每天早上都要吃二甲双胍。",
  "我血压的药放在客厅电视柜第一个抽屉里。",
  "我记性最近不太好，经常想不起来钥匙放在哪里。",
  "上个月我把老花镜落在菜市场了，后来摊主给我送回来了。",
  "我养了一只鸟，名字叫小黄，是一只八哥，会学我说话。",
  "十月二十日女儿带孙子来看我，我要提前买好桂花糕。",
  "十月二十五日上午我要去社区医院做体检。",
  "十一月八日是我七十八岁生日，儿子说要回来。",
  "今年中秋节我和儿子女儿一起在南京过的，很热闹。",
  "我上个星期和老周去夫子庙吃了鸭血粉丝汤。",
  "我昨天下午在阳台上晒被子，太阳很好。",
  "我前天晚上给小黄洗了笼子，它挺高兴的。",
  "我年轻的时候去过北京，在天安门前照过相。",
  "我最喜欢的电视节目是新闻联播和天气预报。",
  "我每天早上六点就醒了，先喝一杯温水。",
  "我女儿上星期给我买了一件深蓝色的棉袄。",
  "我孙子李念上次考试考了九十五分，我很高兴。",
  "我老伴王桂英最会包荠菜饺子，我一顿能吃二十个。",
  "我老家芜湖有个镜湖，小时候我常去那儿玩。",
  "我每天晚饭后都要在小区里走三千步。",
  "我不太会用智能手机，视频电话要女儿帮我拨。",
];

function parseArgs(argv) {
  const options = {
    site: DEFAULT_SITE_URL,
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
    phone: DEFAULT_PHONE,
    password: DEFAULT_PASSWORD,
    patientName: DEFAULT_PATIENT_NAME,
    dryRun: false,
    skipChat: false,
    chatOnly: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--skip-chat") {
      options.skipChat = true;
      continue;
    }
    if (arg === "--chat-only") {
      options.chatOnly = true;
      continue;
    }
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (key === "site") options.site = value;
    else if (key === "supabase-url") options.supabaseUrl = value;
    else if (key === "supabase-anon-key") options.supabaseAnonKey = value;
    else if (key === "phone") options.phone = value;
    else if (key === "password") options.password = value;
    else if (key === "patient") options.patientName = value;
  }

  options.site = options.site.replace(/\/+$/, "");
  options.supabaseUrl = options.supabaseUrl.replace(/\/+$/, "");

  return options;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { status: response.status, ok: response.ok, body };
}

async function login(options) {
  const result = await requestJson(
    `${options.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: options.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `${options.phone}@memory-pal.local`,
        password: options.password,
      }),
    },
  );

  if (!result.ok || !result.body?.access_token || !result.body?.user?.id) {
    throw new Error(
      `登录失败（HTTP ${result.status}）：${JSON.stringify(result.body)}`,
    );
  }

  return {
    accessToken: result.body.access_token,
    userId: result.body.user.id,
  };
}

function restHeaders(options, session) {
  return {
    apikey: options.supabaseAnonKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
}

async function findPatient(options, session) {
  const query = new URLSearchParams({
    select: "id,name",
    owner_id: `eq.${session.userId}`,
    name: `eq.${options.patientName}`,
  });
  const result = await requestJson(
    `${options.supabaseUrl}/rest/v1/patients?${query.toString()}`,
    { headers: restHeaders(options, session) },
  );

  if (!result.ok) {
    throw new Error(
      `查询长辈失败（HTTP ${result.status}）：${JSON.stringify(result.body)}`,
    );
  }

  return Array.isArray(result.body) && result.body.length > 0
    ? result.body[0]
    : null;
}

async function createPatient(options, session) {
  const result = await requestJson(`${options.supabaseUrl}/rest/v1/patients`, {
    method: "POST",
    headers: {
      ...restHeaders(options, session),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      owner_id: session.userId,
      name: options.patientName,
    }),
  });

  if (!result.ok || !Array.isArray(result.body) || result.body.length === 0) {
    throw new Error(
      `创建长辈失败（HTTP ${result.status}）：${JSON.stringify(result.body)}`,
    );
  }

  return result.body[0];
}

async function ensurePatient(options, session) {
  const existing = await findPatient(options, session);

  if (existing) {
    return { patient: existing, created: false };
  }

  if (options.dryRun) {
    return {
      patient: { id: "(dry-run)", name: options.patientName },
      created: false,
    };
  }

  return { patient: await createPatient(options, session), created: true };
}

async function writeMemory(options, patientId, content) {
  const result = await requestJson(`${options.site}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId, content }),
  });

  if (result.status === PENDING_STATUS) {
    return {
      content,
      outcome: "pending",
      message: result.body?.message ?? "置信度不足，未写入。",
    };
  }

  if (!result.ok) {
    return {
      content,
      outcome: "error",
      message: `HTTP ${result.status}：${result.body?.error ?? ""}`,
    };
  }

  if (result.body?.duplicate) {
    return { content, outcome: "duplicate" };
  }

  if (!result.body?.memory?.id) {
    return { content, outcome: "error", message: "响应里没有 memory.id" };
  }

  return {
    content,
    outcome: "created",
    memoryId: result.body.memory.id,
    emotion: result.body.memory.emotion,
    entities: result.body.memory.entities,
  };
}

async function listMemories(options, patientId) {
  const result = await requestJson(
    `${options.site}/api/memory?patientId=${encodeURIComponent(patientId)}`,
  );

  if (!result.ok) {
    throw new Error(
      `读取记忆失败（HTTP ${result.status}）：${JSON.stringify(result.body)}`,
    );
  }

  return Array.isArray(result.body?.memories) ? result.body.memories : [];
}

async function askQuestion(options, patientId, message) {
  // 远端 Supabase 偶发 AbortError（smart client 解析/连接超时）会让
  // /api/chat 返回 500。这不是业务失败，重试一次即可，否则自检结果
  // 会被网络抖动污染。
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await requestJson(`${options.site}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, message }),
    });

    if (result.ok) {
      return { message, reply: result.body?.reply ?? "" };
    }

    lastError = `HTTP ${result.status}：${result.body?.error ?? ""}`;

    if (result.status < 500) {
      break;
    }
  }

  return { message, reply: "", error: lastError };
}

async function readChatChecks() {
  const checksUrl = new URL("./seed-chat-checks.json", import.meta.url);
  return JSON.parse(await readFile(checksUrl, "utf8"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = await readChatChecks();

  console.log(`站点：${options.site}`);
  console.log(`长辈：${options.patientName}`);
  console.log(`记忆条数：${MEMORY_SEEDS.length}`);

  if (options.dryRun) {
    console.log("\n[dry-run] 以下记忆将被写入（不实际调用接口）：");
    for (const content of MEMORY_SEEDS) {
      console.log(`  - ${content}`);
    }
    return 0;
  }

  const session = await login(options);
  console.log(`登录成功：${session.userId}`);

  const { patient, created } = await ensurePatient(options, session);
  console.log(
    `长辈 ${patient.name}：${created ? "已创建" : "已存在"} ${patient.id}`,
  );

  const summary = {
    created: 0,
    duplicate: 0,
    pending: 0,
    error: 0,
  };
  const failures = [];

  if (options.chatOnly) {
    console.log("（--chat-only：跳过写入，只跑问答自检）");
  } else {
    for (const content of MEMORY_SEEDS) {
      const result = await writeMemory(options, patient.id, content);
      summary[result.outcome] += 1;

      if (result.outcome === "error" || result.outcome === "pending") {
        failures.push(result);
        console.log(`  [${result.outcome}] ${content} -> ${result.message}`);
      } else {
        console.log(`  [${result.outcome}] ${content}`);
      }
    }

    console.log(
      `\n写入结果：新增 ${summary.created}，已存在 ${summary.duplicate}，` +
        `待确认 ${summary.pending}，失败 ${summary.error}`,
    );
  }

  const memories = await listMemories(options, patient.id);
  console.log(`库里现有记忆：${memories.length} 条`);

  if (memories.length < MEMORY_SEEDS.length) {
    console.log(
      `⚠️ 记忆条数少于预期（${memories.length} < ${MEMORY_SEEDS.length}）`,
    );
  }

  if (options.skipChat) {
    return failures.length > 0 ? 1 : 0;
  }

  console.log("\n问答自检：");
  let chatPassed = 0;

  for (const check of checks) {
    const { message, reply, error } = await askQuestion(
      options,
      patient.id,
      check.question,
    );

    if (error) {
      console.log(`  ✗ ${check.question} -> ${error}`);
      continue;
    }

    const hit = check.expect.some((keyword) => reply.includes(keyword));
    if (hit) {
      chatPassed += 1;
    }
    console.log(
      `  ${hit ? "✓" : "✗"} ${check.question}\n    忆伴：${reply}`,
    );
  }

  console.log(`\n问答通过：${chatPassed}/${checks.length}`);

  return failures.length > 0 ? 1 : 0;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`失败：${error.message}`);
      process.exitCode = 1;
    });
}