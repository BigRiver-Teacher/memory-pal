import json
import os
import urllib.error
import urllib.request

API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"
MEMORY = "老伴已于去年过世"
PATIENT_MESSAGE = "我老伴今天怎么没来？"
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
EMOTION_MARKERS = (
    "想他",
    "想她",
    "想念",
    "惦记",
    "牵挂",
    "思念",
    "舍不得",
    "心里",
    "难受",
)
MEMORY_MARKERS = (
    "记得",
    "回忆",
    "以前",
    "过去",
    "当年",
    "说说",
    "聊聊",
    "讲讲",
    "开心的事",
)
MAX_REPLY_LENGTH = 50
MAX_ATTEMPTS = 3
MISSING_API_KEY_MESSAGE = "请在 Windows 环境变量中配置 DEEPSEEK_API_KEY"
SYSTEM_PROMPT = (
    "你是一个温和、有同理心的陪伴助手。"
    f"数据库中的记忆：{MEMORY}。"
    "你只生成一句直接对患者说的话，不要解释，不要添加引号。"
    "硬约束："
    "1. 禁止对任何不在场的人或事的“当前状态、当前位置、正在做什么”"
    "进行推测或编造。"
    "2. 如果患者问“某人/某物现在在哪/怎么样了”，不能回答“他可能在做xx”"
    "或“他应该xx”，只能先认可患者的情感（例如“您想他了”），"
    "然后把话题转向回忆（例如“他一定有很多让您开心的事，能跟我说说吗？”）。"
    f"3. 回复中绝不能出现这些词：{'、'.join(FORBIDDEN_WORDS)}。"
    f"4. 回复中绝不能出现这些推测词：{'、'.join(SPECULATION_WORDS)}。"
    "5. 回复必须先认可患者的情感，再自然转向回忆。"
    f"6. 回复不能超过 {MAX_REPLY_LENGTH} 个字。"
    "只输出最终回复本身。"
)


def build_messages():
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": PATIENT_MESSAGE},
    ]


def request_reply(api_key, messages):
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.7,
    }
    request = urllib.request.Request(
        API_URL,
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


def get_reply_validation_error(reply):
    if not reply:
        return "回复为空"

    if len(reply) > MAX_REPLY_LENGTH:
        return f"回复超过 {MAX_REPLY_LENGTH} 个字"

    forbidden_word = next(
        (word for word in FORBIDDEN_WORDS if word in reply),
        None,
    )
    if forbidden_word:
        return f"回复包含禁用词“{forbidden_word}”"

    speculation_word = next(
        (word for word in SPECULATION_WORDS if word in reply),
        None,
    )
    if speculation_word:
        return f"回复包含推测词“{speculation_word}”"

    if not any(marker in reply for marker in EMOTION_MARKERS):
        return "回复没有先认可患者的情感"

    if not any(marker in reply for marker in MEMORY_MARKERS):
        return "回复没有自然转向回忆"

    return None


def generate_reply(api_key):
    messages = build_messages()

    for attempt in range(MAX_ATTEMPTS):
        reply = request_reply(api_key, messages)
        validation_error = get_reply_validation_error(reply)
        if validation_error is None:
            return reply

        if attempt + 1 < MAX_ATTEMPTS:
            messages.extend(
                [
                    {"role": "assistant", "content": reply},
                    {
                        "role": "user",
                        "content": (
                            f"上面的回复不合格：{validation_error}。"
                            "请重新生成一句回复。必须先认可患者情感，再转向回忆；"
                            "不得推测不在场的人或物的当前状态或位置；"
                            f"不能出现{'、'.join(FORBIDDEN_WORDS)}；"
                            f"不能出现{'、'.join(SPECULATION_WORDS)}；"
                            f"不能超过 {MAX_REPLY_LENGTH} 个字。"
                            "只输出回复本身。"
                        ),
                    },
                ]
            )

    raise RuntimeError("未能生成符合要求的回复")


def main():
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print(MISSING_API_KEY_MESSAGE)
        raise SystemExit(1)

    try:
        reply = generate_reply(api_key)
    except RuntimeError as exc:
        print(str(exc))
        raise SystemExit(1) from exc

    print(reply)


if __name__ == "__main__":
    main()