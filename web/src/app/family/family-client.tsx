"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type FamilyClientProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type PatientRow = {
  id: string;
  name: string;
  family_contact: string | null;
  created_at: string;
};

type MemoryRow = {
  id: string;
  content: string;
  created_at: string;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
};

const now = new Date();
const currentDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(now);
const currentDateTime = now.toISOString().slice(0, 10);

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function FamilyClient({
  supabaseUrl,
  supabaseAnonKey,
}: FamilyClientProps) {
  const router = useRouter();
  const [supabase] = useState(() =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function initialize() {
      setIsLoading(true);
      setLoadError("");

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (!isActive) {
          return;
        }

        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        const { data: patientData, error: patientError } =
          await supabase
            .from("patients")
            .select("id, name, family_contact, created_at")
            .eq("owner_id", userData.user.id)
            .order("created_at", { ascending: true });

        if (!isActive) {
          return;
        }

        if (patientError) {
          throw new Error(patientError.message);
        }

        const patients = (patientData ?? []) as PatientRow[];

        if (patients.length === 0) {
          router.replace("/family/bind");
          return;
        }

        const storedPatientId =
          window.localStorage.getItem("current_patient_id");
        const patient =
          patients.find(
            (candidate) => candidate.id === storedPatientId,
          ) ?? patients[0];

        window.localStorage.setItem(
          "current_patient_id",
          patient.id,
        );
        setPatientId(patient.id);
        setPatientName(patient.name);

        const response = await fetch(
          `/api/memory?patientId=${encodeURIComponent(patient.id)}`,
        );

        if (!response.ok) {
          throw new Error("Memory list request failed");
        }

        const data = (await response.json()) as {
          memories?: MemoryRow[];
        };

        if (isActive) {
          setMemories(data.memories ?? []);
        }
      } catch {
        if (isActive) {
          setLoadError("暂时无法读取记忆，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  async function saveMemory() {
    const trimmedContent = content.trim();

    if (!patientId || !trimmedContent || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId,
          content: trimmedContent,
        }),
      });

      if (!response.ok) {
        throw new Error("Memory save request failed");
      }

      const data = (await response.json()) as {
        memory?: MemoryRow;
      };

      if (!data.memory) {
        throw new Error("Invalid memory response");
      }

      setMemories((currentMemories) => [
        data.memory as MemoryRow,
        ...currentMemories.filter(
          (memory) => memory.id !== data.memory?.id,
        ),
      ]);
      setContent("");
      setIsAddOpen(false);
    } catch {
      setSaveError("保存失败，请再试一次");
    } finally {
      setIsSaving(false);
    }
  }

  function closeAddDialog() {
    if (isSaving) {
      return;
    }

    setContent("");
    setSaveError("");
    setIsAddOpen(false);
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#f7f3ea] text-[#2d2924]">
      <header className="shrink-0 border-b border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-5 shadow-sm backdrop-blur sm:px-8 sm:py-6">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-base font-medium text-[#7a6f61] sm:text-lg">
              家属记忆管理{patientName ? ` · ${patientName}` : ""}
            </p>
            <h1 className="mt-1 text-4xl font-bold tracking-wide text-[#205c4b] sm:text-5xl">
              忆伴 · 家属端
            </h1>
          </div>

          <time
            dateTime={currentDateTime}
            suppressHydrationWarning
            className="max-w-[42%] text-right text-lg font-semibold leading-8 text-[#5f5549] sm:text-xl"
          >
            {currentDate}
          </time>
        </div>
      </header>

      <section
        aria-label="患者记忆列表"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {isLoading && (
            <p className="rounded-3xl border border-[#dfd6c8] bg-white px-6 py-8 text-center text-xl text-[#7a6f61]">
              正在加载记忆...
            </p>
          )}

          {!isLoading && loadError && (
            <p
              role="alert"
              className="rounded-3xl border border-[#e7b9b3] bg-[#fff0ef] px-6 py-8 text-center text-xl font-semibold text-[#a33a31]"
            >
              {loadError}
            </p>
          )}

          {!isLoading && !loadError && memories.length === 0 && (
            <p className="rounded-3xl border border-dashed border-[#cfc3b3] bg-white/70 px-6 py-10 text-center text-xl leading-8 text-[#7a6f61]">
              还没有保存记忆，点击下方“添加记忆”开始记录。
            </p>
          )}

          {!isLoading &&
            !loadError &&
            memories.map((memory) => {
              const emotion = memory.emotion?.trim() || "未分类";
              const entities = memory.entities ?? [];
              const sourceLabel =
                memory.source === "family"
                  ? "家属录入"
                  : "患者自述";

              return (
                <article
                  key={memory.id}
                  className="rounded-3xl border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-6"
                >
                  <p className="text-xl leading-9 text-[#2d2924] sm:text-2xl">
                    {memory.content}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#fff3d8] px-3 py-1 text-base font-semibold text-[#8a5a16]">
                      情绪：{emotion}
                    </span>
                    <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-base font-semibold text-[#205c4b]">
                      {sourceLabel}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-base font-semibold text-[#6f6457]">
                      关联人物
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entities.length > 0 ? (
                        entities.map((entity) => (
                          <span
                            key={entity}
                            className="rounded-full bg-[#edf2fa] px-3 py-1 text-base font-semibold text-[#355c8a]"
                          >
                            {entity}
                          </span>
                        ))
                      ) : (
                        <span className="text-base text-[#9a8f81]">
                          未关联人物
                        </span>
                      )}
                    </div>
                  </div>

                  <time
                    dateTime={memory.created_at}
                    className="mt-4 block text-base font-medium text-[#8b7f70] sm:text-lg"
                  >
                    {formatCreatedAt(memory.created_at)}
                  </time>
                </article>
              );
            })}
        </div>
      </section>

      <footer className="shrink-0 border-t border-[#dfd6c8] bg-[#fffdf8]/95 px-4 py-4 shadow-[0_-8px_24px_rgba(72,58,42,0.08)] backdrop-blur sm:px-8 sm:py-5">
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          disabled={!patientId}
          className="mx-auto flex min-h-16 w-full max-w-4xl items-center justify-center rounded-2xl bg-[#205c4b] px-8 text-xl font-bold text-white shadow-lg transition hover:bg-[#18493c] focus:outline-none focus:ring-4 focus:ring-[#4f8f78]/35 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        >
          添加记忆
        </button>
      </footer>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-memory-title"
            className="w-full max-w-xl rounded-[28px] border border-[#e4dbcf] bg-[#fffdf8] p-5 shadow-2xl sm:p-7"
          >
            <h2
              id="add-memory-title"
              className="text-3xl font-bold text-[#205c4b]"
            >
              添加记忆
            </h2>
            <p className="mt-2 text-lg leading-8 text-[#7a6f61]">
              写下一段想帮患者记住的事情。
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveMemory();
              }}
            >
              <label
                htmlFor="memory-content"
                className="sr-only"
              >
                记忆内容
              </label>
              <textarea
                id="memory-content"
                autoFocus
                rows={5}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="例如：女儿小芳每周日都会来看她"
                className="mt-5 w-full resize-none rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 py-4 text-xl leading-8 text-[#2d2924] outline-none transition placeholder:text-[#9a8f81] focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
              />

              {saveError && (
                <p
                  role="alert"
                  className="mt-3 rounded-2xl bg-[#fff0ef] px-4 py-3 text-center text-base font-semibold text-[#a33a31]"
                >
                  {saveError}
                </p>
              )}

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeAddDialog}
                  disabled={isSaving}
                  className="min-h-14 rounded-2xl border-2 border-[#cfc3b3] bg-white px-7 text-lg font-bold text-[#5f5549] transition hover:bg-[#f5f0e8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !content.trim()}
                  className="min-h-14 rounded-2xl bg-[#205c4b] px-7 text-lg font-bold text-white shadow-md transition hover:bg-[#18493c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "正在保存..." : "保存记忆"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}