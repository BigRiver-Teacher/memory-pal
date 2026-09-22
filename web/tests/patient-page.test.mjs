import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL(
  "../src/app/patient/page.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../src/app/patient/patient-client.tsx",
  import.meta.url,
);
const pageSource = await readFile(pageUrl, "utf8");
const clientSource = await readFile(clientUrl, "utf8");

test("patient page resolves patient id from local storage", () => {
  assert.match(pageSource, /force-dynamic/);
  assert.match(pageSource, /process\.env\.SUPABASE_URL/);
  assert.ok(clientSource.includes("current_patient_id"));
  assert.ok(clientSource.includes("window.localStorage.getItem"));
  assert.ok(clientSource.includes('router.replace("/patient/bind")'));
  assert.ok(clientSource.includes("supabase.auth.getUser"));
  assert.ok(clientSource.includes(".eq(\"owner_id\", userData.user.id)"));
  assert.ok(!clientSource.includes("TEST_PATIENT_ID"));
});

test("patient page sends selected patient id to chat API", () => {
  assert.ok(clientSource.includes('fetch("/api/chat"'));
  assert.ok(clientSource.includes('method: "POST"'));
  assert.ok(clientSource.includes("patientId,"));
  assert.ok(clientSource.includes("message: trimmedMessage"));
  assert.ok(clientSource.includes("当前患者："));
  assert.ok(clientSource.includes('href="/home"'));
  assert.ok(clientSource.includes('href="/patient/today"'));
  assert.ok(clientSource.includes("今天"));
});

test("patient page includes loading, error, reset and scroll behavior", () => {
  assert.ok(clientSource.includes("正在思考..."));
  assert.ok(clientSource.includes("网络不太好，请再试一次"));
  assert.ok(clientSource.includes('setMessage("")'));
  assert.ok(clientSource.includes("scrollIntoView"));
  assert.ok(clientSource.includes("messagesEndRef"));
  assert.ok(
    clientSource.includes(
      "const inputRef = useRef<HTMLTextAreaElement>(null)",
    ),
  );
  assert.ok(clientSource.includes("ref={inputRef}"));
  assert.ok(clientSource.includes("inputRef.current?.focus()"));
  assert.ok(clientSource.includes("wasLoadingRef.current"));
  assert.ok(clientSource.includes("wasLoadingRef.current = isLoading"));
  assert.ok(!clientSource.includes("disabled={isLoading}"));
  assert.ok(!clientSource.includes("readOnly"));
  assert.ok(
    clientSource.includes('showTextInput ? "flex" : "hidden"'),
  );
  assert.ok(clientSource.includes("h-dvh flex-col overflow-hidden"));
  assert.ok(clientSource.includes("min-h-0 flex-1 overflow-y-auto"));
});

test("voice control uses browser SpeechRecognition", () => {
  const voiceButton = clientSource.slice(
    clientSource.indexOf('aria-label="按住说话"'),
    clientSource.indexOf("</button>", clientSource.indexOf('aria-label="按住说话"')),
  );

  assert.ok(clientSource.includes("webkitSpeechRecognition"));
  assert.ok(clientSource.includes('recognition.lang = "zh-CN"'));
  assert.ok(clientSource.includes("recognition.start()"));
  assert.ok(clientSource.includes("recognition.stop()"));
  assert.ok(clientSource.includes("onPointerDown={handleVoicePointerDown}"));
  assert.ok(clientSource.includes("onPointerUp={handleVoicePointerUp}"));
  assert.ok(clientSource.includes("正在听..."));
  assert.ok(clientSource.includes("没听清，请再说一次"));
  assert.ok(clientSource.includes("您的浏览器不支持语音输入，请使用文字输入"));
  assert.ok(voiceButton.includes("onPointerDown"));
});