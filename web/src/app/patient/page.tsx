"use client";

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
            className="max-w-[45%] text-right text-base font-semibold leading-7 text-[#5f5549] sm:text-xl"
          >
            {currentDate}
          </time>
        </div>
      </header>

      <section
        aria-label="对话记录"
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          {mockMessages.map((message) => {
            const isPatient = message.sender === "patient";

            return (
              <div
                key={message.id}
                className={`flex items-end gap-3 ${
                  isPatient ? "justify-end" : "justify-start"
                }`}
              >
                {!isPatient && (
                  <div
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#205c4b] text-xl font-bold text-white shadow-sm"
                  >
                    忆
                  </div>
                )}

                <div
                  className={`max-w-[84%] rounded-[28px] px-5 py-4 text-xl leading-8 shadow-sm sm:max-w-[72%] ${
                    isPatient
                      ? "rounded-br-lg bg-[#4f8f78] text-white"
                      : "rounded-bl-lg border border-[#e4dbcf] bg-white text-[#2d2924]"
                  }`}
                >
                  <p
                    className={`mb-1 text-sm font-semibold ${
                      isPatient ? "text-[#e8fff5]" : "text-[#7a6f61]"
                    }`}
                  >
                    {isPatient ? "我" : "忆伴"}
                  </p>
                  <p>{message.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="sticky bottom-0 border-t border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-4 shadow-[0_-8px_24px_rgba(72,58,42,0.08)] backdrop-blur sm:px-8 sm:py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-stretch">
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
            className="min-h-[72px] rounded-2xl bg-[#205c4b] px-8 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 active:translate-y-px sm:min-w-36"
          >
            发送
          </button>
        </div>
      </footer>
    </main>
  );
}