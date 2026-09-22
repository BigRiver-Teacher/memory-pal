"use client";

import { useState } from "react";

type Message = {
  id: number;
  sender: "patient" | "ai";
  text: string;
};

const mockMessages: Message[] = [
  {
    id: 1,
    sender: "ai",
    text: "阿姨，今天感觉怎么样？",
  },
  {
    id: 2,
    sender: "patient",
    text: "我吃午饭了吗？",
  },
  {
    id: 3,
    sender: "ai",
    text: "今天中午您吃了红烧肉，是女儿小芳送来的。",
  },
];

const now = new Date();
const currentDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(now);
const currentDateTime = now.toISOString().slice(0, 10);

export default function PatientPage() {
  const [showTextInput, setShowTextInput] = useState(false);

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <header className="border-b border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-5 shadow-sm backdrop-blur sm:px-8 sm:py-6">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-base font-medium text-[#7a6f61] sm:text-lg">
              陪伴每一段记忆
            </p>
            <h1 className="mt-1 text-4xl font-bold tracking-wide text-[#205c4b] sm:text-5xl">
              忆伴
            </h1>
          </div>

          <time
            dateTime={currentDateTime}
            suppressHydrationWarning
            className="max-w-[45%] text-right text-lg font-semibold leading-8 text-[#5f5549] sm:text-xl"
          >
            {currentDate}
          </time>
        </div>
      </header>

      <section
        aria-label="对话记录"
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-7">
          {mockMessages.map((message) => {
            const isPatient = message.sender === "patient";

            return (
              <div
                key={message.id}
                className={`flex ${
                  isPatient ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex max-w-[88%] flex-col gap-2 sm:max-w-[76%] ${
                    isPatient ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`flex items-center gap-3 ${
                      isPatient ? "flex-row-reverse" : ""
                    }`}
                  >
                    <div
                      aria-hidden="true"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold shadow-sm ${
                        isPatient
                          ? "bg-[#dcece5] text-[#205c4b]"
                          : "bg-[#205c4b] text-white"
                      }`}
                    >
                      {isPatient ? "我" : "忆"}
                    </div>
                    <p className="text-sm font-semibold text-[#6f6457]">
                      {isPatient ? "我" : "忆伴"}
                    </p>
                  </div>

                  <div
                    className={`w-fit max-w-full rounded-[28px] px-5 py-4 text-xl leading-8 shadow-sm ${
                      isPatient
                        ? "rounded-br-lg bg-[#4f8f78] text-white"
                        : "rounded-bl-lg border border-[#e4dbcf] bg-white text-[#2d2924]"
                    }`}
                  >
                    <p>{message.text}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="sticky bottom-0 border-t border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-5 shadow-[0_-8px_24px_rgba(72,58,42,0.08)] backdrop-blur sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
          <button
            type="button"
            aria-label="按住说话"
            className="flex h-28 w-28 items-center justify-center rounded-full bg-[#205c4b] text-xl font-bold text-white shadow-lg transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 active:translate-y-px sm:h-32 sm:w-32"
          >
            按住说话
          </button>

          <button
            type="button"
            aria-expanded={showTextInput}
            aria-controls="text-input-panel"
            onClick={() => setShowTextInput((isOpen) => !isOpen)}
            className="text-sm font-medium text-[#5f5549] underline decoration-[#9f9384] underline-offset-4 transition hover:text-[#205c4b] focus:outline-none focus:ring-2 focus:ring-[#4f8f78]/30"
          >
            切换文字输入
          </button>

          {showTextInput && (
            <div
              id="text-input-panel"
              className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch"
            >
              <label htmlFor="patient-message" className="sr-only">
                输入消息
              </label>
              <textarea
                id="patient-message"
                rows={2}
                placeholder="想说什么，就写在这里..."
                className="min-h-[72px] flex-1 resize-none rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 py-4 text-xl leading-8 text-[#2d2924] outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
              />
              <button
                type="button"
                className="min-h-14 rounded-2xl bg-[#4f8f78] px-7 text-lg font-bold text-white shadow-md transition hover:bg-[#3e7863] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 active:translate-y-px sm:min-w-28"
              >
                发送
              </button>
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}