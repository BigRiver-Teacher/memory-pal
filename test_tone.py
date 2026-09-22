import json
import os
import urllib.error
import urllib.request

API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"
MEMORY = "老伴已于去年过世"
PATIENT_MESSAGE = "我老伴今天怎么没来？"
FORBIDDEN_WORDS = ("过世", "去世", "走了")
MAX_REPLY_LENGTH = 50
MAX_ATTEMPTS = 2
MISSING_API_KEY_MESSAGE = "请在 Windows 环境变量中配置 DEEPSEEK_API_KEY"
SYSTEM_PROMPT = (
    "你是一个温和、有同理心的陪伴助手。"
    f"数据库中的记忆：{MEMORY}。"
    "请直接生成一句对患者说的话，不要解释，不要添加引号。"
    "回复必须是安抚患者或自然转移话题的句子。"
    f"回复中绝不能出现这些词：{'、'.join(FORBIDDEN_WORDS)}。"
    f"回复不能超过 {MAX_REPLY_LENGTH} 个字。"
    "可以自然引导患者喝茶、休息、看天气等安全话题，"
    "不要编造患者家属今天的具体去向。"
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


def is_acceptable_reply(reply):
    if not reply or len(reply) > MAX_REPLY_LENGTH:
        return False
    return not any(word in reply for word in FORBIDDEN_WORDS)


def generate_reply(api_key):
    messages = build_messages()

    for attempt in range(MAX_ATTEMPTS):
        reply = request_reply(api_key, messages)
        if is_acceptable_reply(reply):
            return reply

        if attempt + 1 < MAX_ATTEMPTS:
            messages.extend(
                [
                    {"role": "assistant", "content": reply},
                    {
                        "role": "user",
                        "content": (
                            "这句回复不符合要求。请重新生成一句安抚或转移话题的话，"
                            f"不能出现{'、'.join(FORBIDDEN_WORDS)}，且不能超过 "
                            f"{MAX_REPLY_LENGTH} 个字。只输出回复本身。"
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