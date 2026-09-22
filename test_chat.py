import json
import os
import urllib.error
import urllib.request

from supabase import create_client

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

SILICONFLOW_API_BASE_URL = "https://api.siliconflow.cn/v1"
SILICONFLOW_EMBEDDINGS_URL = (
    f"{SILICONFLOW_API_BASE_URL}/embeddings"
)
EMBEDDING_MODEL = "BAAI/bge-m3"
EXPECTED_DIMENSION = 1024

TEST_PATIENT_NAME = "对话测试患者"
TEST_FAMILY_CONTACT = "test-chat"

MEMORY_TEXTS = (
    "今天中午吃了红烧肉，是女儿送来的",
    "女儿叫小芳，每周日来看她",
)
PATIENT_INPUT = "我吃午饭了吗"
SECOND_PATIENT_INPUT = "我想我女儿了"

STATEMENT_CONFIRMATION = "statement_confirmation"
EMOTION_VALIDATION = "emotion_validation"

SCENARIOS = (
    {
        "patient_input": PATIENT_INPUT,
        "reply_strategy": STATEMENT_CONFIRMATION,
    },
    {
        "patient_input": SECOND_PATIENT_INPUT,
        "reply_strategy": EMOTION_VALIDATION,
    },
)

EMOTION_MARKERS = (
    "想",
    "想念",
    "惦记",
    "牵挂",
    "思念",
    "舍不得",
    "心里",
)
GUIDANCE_MARKERS = (
    "说说",
    "聊聊",
    "讲讲",
    "回忆",
    "以前",
    "过去",
    "当年",
    "开心的事",
)
TESTING_QUESTION_PATTERNS = (
    "还记得我是谁",
    "知道我是谁",
    "知道今天几号",
    "记得今天几号",
)

MAX_REPLY_LENGTH = 50
MAX_REPLY_ATTEMPTS = 3

FORBIDDEN_WORDS = ("过世", "去世", "走了")
SPECULATION_WORDS = (
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
)


def require_env(name):
    value = os.environ.get(name)
    if not value:
        print(f"请在 Windows 环境变量中配置 {name}")
        raise SystemExit(1)
    return value


def embed_text(text, api_key):
    payload = {
        "model": EMBEDDING_MODEL,
        "input": text,
    }

    request = urllib.request.Request(
        SILICONFLOW_EMBEDDINGS_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        print(f"调用 SiliconFlow API 失败：HTTP {exc.code}")
        raise SystemExit(1) from exc
    except urllib.error.URLError as exc:
        print(f"调用 SiliconFlow API 失败：{exc.reason}")
        raise SystemExit(1) from exc

    api_result = json.loads(response_body)
    embedding = api_result["data"][0]["embedding"]

    if len(embedding) != EXPECTED_DIMENSION:
        print(
            f"向量维度错误：期望 {EXPECTED_DIMENSION}，"
            f"实际 {len(embedding)}"
        )
        raise SystemExit(1)

    return embedding


def get_or_create_test_patient(supabase):
    patient_response = (
        supabase
        .table("patients")
        .select("id")
        .eq("family_contact", TEST_FAMILY_CONTACT)
        .limit(1)
        .execute()
    )

    if patient_response.data:
        return patient_response.data[0]["id"]

    insert_response = (
        supabase
        .table("patients")
        .insert(
            {
                "name": TEST_PATIENT_NAME,
                "family_contact": TEST_FAMILY_CONTACT,
            }
        )
        .execute()
    )

    if not insert_response.data:
        raise RuntimeError("创建测试患者失败")

    return insert_response.data[0]["id"]


def ensure_test_memories(
    supabase,
    patient_id,
    siliconflow_api_key,
):
    existing_response = (
        supabase
        .table("memories")
        .select("content")
        .eq("patient_id", patient_id)
        .execute()
    )

    existing_contents = {
        row["content"]
        for row in (existing_response.data or [])
    }

    for memory_text in MEMORY_TEXTS:
        if memory_text in existing_contents:
            continue

        memory_embedding = embed_text(
            memory_text,
            siliconflow_api_key,
        )

        insert_response = (
            supabase
            .table("memories")
            .insert(
                {
                    "patient_id": patient_id,
                    "content": memory_text,
                    "embedding": memory_embedding,
                }
            )
            .execute()
        )

        if not insert_response.data:
            raise RuntimeError(
                f"创建测试记忆失败：{memory_text}"
            )


def retrieve_memories(
    supabase,
    patient_id,
    query_embedding,
):
    match_response = (
        supabase
        .rpc(
            "match_memories",
            {
                "p_patient_id": patient_id,
                "p_query_embedding": query_embedding,
                "p_match_count": 2,
            },
        )
        .execute()
    )

    return match_response.data or []


def build_system_prompt(
    memories,
    patient_input=PATIENT_INPUT,
    reply_strategy=STATEMENT_CONFIRMATION,
):
    if reply_strategy == STATEMENT_CONFIRMATION:
        strategy_rules = (
            "4. 只能使用陈述句温和确认，不能出现问号。\n"
        )
    elif reply_strategy == EMOTION_VALIDATION:
        strategy_rules = (
            "4. 必须先明确认可患者的情绪，再温和引导患者回忆。\n"
            "5. 允许温和的引导式提问，例如“能跟我说说你们以前常做的事吗？”，"
            "但禁止测试性提问，例如“您还记得我是谁吗？”“您知道今天几号吗？”。"
            "每句回复最多只能包含一个问号。\n"
        )
    else:
        raise ValueError(f"未知回复策略：{reply_strategy}")

    memory_block = "\n".join(
        f"- {memory['content']}"
        for memory in memories
    )

    return (
        "你是一个温和、克制的陪伴助手。\n"
        "以下是从患者记忆中检索到的内容，"
        "回复时只能依据这些内容：\n"
        f"{memory_block}\n\n"
        f"当前患者说：{patient_input}\n\n"
        "请严格遵守以下要求：\n"
        "1. 语气必须温和、克制。\n"
        "2. 不得编造记忆中没有的信息，"
        "不得补充不存在的事实、动机、情感或当前行踪。\n"
        "3. 不得要求患者证明记忆或回答身份、时间类测试问题。\n"
        f"{strategy_rules}"
        "无论场景如何，还必须遵守：\n"
        "不得出现“过世”“去世”“走了”等词。\n"
        "不得使用“可能”“应该”“大概”“也许”“或许”"
        "等推测词。\n"
        f"回复不能超过 {MAX_REPLY_LENGTH} 个字。\n"
        "只输出最终回复，不要解释。"
    )

def request_deepseek_reply(
    api_key,
    messages,
):
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": 0.3,
    }

    request = urllib.request.Request(
        DEEPSEEK_API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        print(f"调用 DeepSeek API 失败：HTTP {exc.code}")
        raise SystemExit(1) from exc
    except urllib.error.URLError as exc:
        print(f"调用 DeepSeek API 失败：{exc.reason}")
        raise SystemExit(1) from exc

    api_result = json.loads(response_body)
    return api_result["choices"][0]["message"]["content"].strip()


def count_question_marks(reply):
    return reply.count("?") + reply.count("？")


def is_acceptable_reply(reply, reply_strategy=None):
    if not reply:
        return False

    if len(reply) > MAX_REPLY_LENGTH:
        return False

    question_mark_count = count_question_marks(reply)
    if question_mark_count > 1:
        return False

    if any(
        pattern in reply
        for pattern in TESTING_QUESTION_PATTERNS
    ):
        return False

    if any(word in reply for word in FORBIDDEN_WORDS):
        return False

    if any(word in reply for word in SPECULATION_WORDS):
        return False

    if reply_strategy == STATEMENT_CONFIRMATION:
        if question_mark_count != 0:
            return False

    elif reply_strategy == EMOTION_VALIDATION:
        has_emotion_acknowledgement = any(
            marker in reply
            for marker in EMOTION_MARKERS
        )
        has_gentle_guidance = (
            question_mark_count == 1
            or any(marker in reply for marker in GUIDANCE_MARKERS)
        )
        if not has_emotion_acknowledgement:
            return False
        if not has_gentle_guidance:
            return False

    elif reply_strategy is not None:
        raise ValueError(f"未知回复策略：{reply_strategy}")

    return True


def generate_reply(
    deepseek_api_key,
    memories,
    patient_input=PATIENT_INPUT,
    reply_strategy=STATEMENT_CONFIRMATION,
):
    messages = [
        {
            "role": "system",
            "content": build_system_prompt(
                memories,
                patient_input,
                reply_strategy,
            ),
        },
        {
            "role": "user",
            "content": patient_input,
        },
    ]

    for attempt in range(MAX_REPLY_ATTEMPTS):
        reply = request_deepseek_reply(
            deepseek_api_key,
            messages,
        )

        if is_acceptable_reply(reply, reply_strategy):
            return reply

        if attempt + 1 < MAX_REPLY_ATTEMPTS:
            if reply_strategy == STATEMENT_CONFIRMATION:
                strategy_feedback = (
                    "必须用陈述句温和确认，不能出现问号。"
                )
            else:
                strategy_feedback = (
                    "必须先认可患者情感，再温和引导回忆；"
                    "最多只能有一个问号，并且禁止测试性提问。"
                )

            messages.extend(
                [
                    {
                        "role": "assistant",
                        "content": reply,
                    },
                    {
                        "role": "user",
                        "content": (
                            "上面的回复不符合要求。请重新生成一句回复。"
                            "只依据检索到的记忆，不得编造。"
                            f"{strategy_feedback}"
                            f"不能超过 {MAX_REPLY_LENGTH} 个字。"
                            "只输出回复本身。"
                        ),
                    },
                ]
            )

    raise RuntimeError("未能生成符合要求的回复")

def save_conversation(
    supabase,
    patient_id,
    reply,
    patient_input=PATIENT_INPUT,
):
    response = (
        supabase
        .table("conversations")
        .insert(
            [
                {
                    "patient_id": patient_id,
                    "role": "user",
                    "content": patient_input,
                },
                {
                    "patient_id": patient_id,
                    "role": "assistant",
                    "content": reply,
                },
            ]
        )
        .execute()
    )

    if len(response.data or []) != 2:
        raise RuntimeError("保存对话记录失败")

def run_scenario(
    supabase,
    patient_id,
    siliconflow_api_key,
    deepseek_api_key,
    scenario,
):
    patient_input = scenario["patient_input"]
    reply_strategy = scenario["reply_strategy"]

    query_embedding = embed_text(
        patient_input,
        siliconflow_api_key,
    )

    memories = retrieve_memories(
        supabase,
        patient_id,
        query_embedding,
    )

    if not memories:
        raise RuntimeError(
            f"未检索到相关记忆：{patient_input}"
        )

    reply = generate_reply(
        deepseek_api_key,
        memories,
        patient_input,
        reply_strategy,
    )

    save_conversation(
        supabase,
        patient_id,
        reply,
        patient_input,
    )

    return memories, reply


def main():
    deepseek_api_key = require_env("DEEPSEEK_API_KEY")
    siliconflow_api_key = require_env("SILICONFLOW_API_KEY")
    supabase_url = require_env("SUPABASE_URL")
    supabase_service_role_key = require_env(
        "SUPABASE_SERVICE_ROLE_KEY"
    )

    supabase = create_client(
        supabase_url,
        supabase_service_role_key,
    )

    patient_id = get_or_create_test_patient(supabase)

    ensure_test_memories(
        supabase,
        patient_id,
        siliconflow_api_key,
    )

    for index, scenario in enumerate(SCENARIOS, start=1):
        try:
            memories, reply = run_scenario(
                supabase,
                patient_id,
                siliconflow_api_key,
                deepseek_api_key,
                scenario,
            )
        except RuntimeError as exc:
            print(str(exc))
            raise SystemExit(1) from exc

        print(f"场景 {index}：{scenario['patient_input']}")
        print("检索到的记忆：")
        for memory_index, memory in enumerate(memories, start=1):
            similarity = float(memory["similarity"])
            print(
                f"{memory_index}. {memory['content']}"
                f"（相似度：{similarity:.4f}）"
            )

        print("AI 回复：")
        print(reply)

        if index < len(SCENARIOS):
            print()

if __name__ == "__main__":
    main()