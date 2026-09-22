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


def build_system_prompt(memories):
    memory_block = "\n".join(
        f"- {memory['content']}"
        for memory in memories
    )

    return (
        "你是一个温和、克制的陪伴助手。\n"
        "以下是从患者记忆中检索到的内容，"
        "回复时只能依据这些内容：\n"
        f"{memory_block}\n\n"
        "请严格遵守以下要求：\n"
        "1. 用温和确认的语气回复患者。\n"
        "2. 不得编造记忆中没有的信息，"
        "不得补充不存在的事实、动机、情感或当前行踪。\n"
        "3. 不得追问、反问，也不得要求患者继续确认或回答。\n"
        "4. 只使用陈述句，不能出现问号。\n"
        "5. 不得出现“过世”“去世”“走了”等词。\n"
        "6. 不得使用“可能”“应该”“大概”“也许”“或许”"
        "等推测词。\n"
        f"7. 回复不能超过 {MAX_REPLY_LENGTH} 个字。\n"
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


def is_acceptable_reply(reply):
    if not reply:
        return False

    if len(reply) > MAX_REPLY_LENGTH:
        return False

    if "?" in reply or "？" in reply:
        return False

    if any(word in reply for word in FORBIDDEN_WORDS):
        return False

    if any(word in reply for word in SPECULATION_WORDS):
        return False

    return True


def generate_reply(
    deepseek_api_key,
    memories,
):
    messages = [
        {
            "role": "system",
            "content": build_system_prompt(memories),
        },
        {
            "role": "user",
            "content": PATIENT_INPUT,
        },
    ]

    for attempt in range(MAX_REPLY_ATTEMPTS):
        reply = request_deepseek_reply(
            deepseek_api_key,
            messages,
        )

        if is_acceptable_reply(reply):
            return reply

        if attempt + 1 < MAX_REPLY_ATTEMPTS:
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
                            "必须温和确认，只依据检索到的记忆，不得编造，"
                            "不得追问或反问，不能出现问号，"
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
):
    response = (
        supabase
        .table("conversations")
        .insert(
            [
                {
                    "patient_id": patient_id,
                    "role": "user",
                    "content": PATIENT_INPUT,
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

    query_embedding = embed_text(
        PATIENT_INPUT,
        siliconflow_api_key,
    )

    memories = retrieve_memories(
        supabase,
        patient_id,
        query_embedding,
    )

    if not memories:
        print("未检索到相关记忆")
        raise SystemExit(1)

    reply = generate_reply(
        deepseek_api_key,
        memories,
    )

    save_conversation(
        supabase,
        patient_id,
        reply,
    )

    print("检索到的记忆：")
    for index, memory in enumerate(memories, start=1):
        similarity = float(memory["similarity"])
        print(
            f"{index}. {memory['content']}"
            f"（相似度：{similarity:.4f}）"
        )

    print("AI 回复：")
    print(reply)


if __name__ == "__main__":
    main()