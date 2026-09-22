"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FamilyNav from "@/components/FamilyNav";

type MemoryDetailClientProps = {
  memoryId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type MemoryDetail = {
  id: string;
  content: string;
  emotion: string | null;
  entities: string[] | null;
  source: string | null;
  created_at: string;
  askedCount: number;
  lastAskedAt: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "暂无记录";
  }

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

export default function MemoryDetailClient({
  memoryId,
  supabaseUrl,
  supabaseAnonKey,
}: MemoryDetailClientProps) {
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
  const [memory, setMemory] = useState<MemoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (!accessToken) {
      router.replace("/login");
      return null;
    }

    return accessToken;
  }

  useEffect(() => {
    let isActive = true;

    async function loadMemoryDetail() {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!isActive) {
        return;
      }

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(
          `/api/memory/${encodeURIComponent(memoryId)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!isActive) {
          return;
        }

        if (response.status === 404) {
          router.replace("/family");
          return;
        }

        if (!response.ok) {
          throw new Error("Memory detail request failed");
        }

        const data = (await response.json()) as {
          memory?: MemoryDetail;
        };

        if (!data.memory) {
          throw new Error("Invalid memory detail response");
        }

        if (isActive) {
          setMemory(data.memory);
          setEditContent(data.memory.content);
        }
      } catch {
        if (isActive) {
          setErrorMessage("暂时无法读取记忆详情，请稍后再试");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadMemoryDetail();

    return () => {
      isActive = false;
    };
  }, [memoryId, router, supabase]);

  async function saveMemory() {
    const trimmedContent = editContent.trim();

    if (!memory || !trimmedContent || isSaving) {
      return;
    }

    setIsSaving(true);
    setEditError("");

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        return;
      }

      const response = await fetch("/api/memory", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          memoryId: memory.id,
          content: trimmedContent,
        }),
      });

      if (!response.ok) {
        throw new Error("Memory update request failed");
      }

      const data = (await response.json()) as {
        memory?: Pick<
          MemoryDetail,
          "content" | "emotion" | "entities" | "source" | "created_at"
        >;
      };

      if (!data.memory) {
        throw new Error("Invalid memory update response");
      }

      setMemory((currentMemory) =>
        currentMemory
          ? {
              ...currentMemory,
              ...data.memory,
            }
          : currentMemory,
      );
      setIsEditOpen(false);
    } catch {
      setEditError("保存失败，请再试一次");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMemory() {
    if (!memory || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "确定删除这条记忆吗？删除后无法恢复",
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        return;
      }

      const response = await fetch("/api/memory", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          memoryId: memory.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Memory delete request failed");
      }

      router.push("/family");
      router.refresh();
    } catch {
      setErrorMessage("删除失败，请稍后再试");
    } finally {
      setIsDeleting(false);
    }
  }

  const emotion = memory?.emotion?.trim() || "未分类";
  const entities = memory?.entities ?? [];
  const sourceLabel =
    memory?.source === "family" ? "家属录入" : "患者自述";

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <Link
          href="/family"
          className="text-lg font-bold text-[#205c4b] underline decoration-[#9f9384] underline-offset-4"
        >
          ← 返回记忆列表
        </Link>

        {isLoading && (
          <p className="rounded-[28px] border border-[#dfd6c8] bg-white px-6 py-12 text-center text-xl text-[#7a6f61]">
            正在加载记忆详情...
          </p>
        )}

        {!isLoading && errorMessage && !memory && (
          <p
            role="alert"
            className="rounded-[28px] border border-[#e7b9b3] bg-[#fff0ef] px-6 py-8 text-center text-xl font-bold text-[#a33a31]"
          >
            {errorMessage}
          </p>
        )}

        {!isLoading && memory && (
          <>
            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-8">
              <p className="text-lg font-semibold text-[#7a6f61]">
                记忆内容
              </p>
              <p className="mt-4 text-2xl font-bold leading-10 text-[#2d2924] sm:text-3xl">
                {memory.content}
              </p>
            </section>

            <section className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-base font-semibold text-[#7a6f61]">
                  情绪
                </p>
                <p className="mt-3 text-xl font-bold text-[#8a5a16]">
                  {emotion}
                </p>
              </div>

              <div className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-base font-semibold text-[#7a6f61]">
                  来源
                </p>
                <p className="mt-3 text-xl font-bold text-[#205c4b]">
                  {sourceLabel}
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
              <p className="text-base font-semibold text-[#7a6f61]">
                关联人物
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {entities.length > 0 ? (
                  entities.map((entity) => (
                    <span
                      key={entity}
                      className="rounded-full bg-[#edf2fa] px-4 py-2 text-lg font-bold text-[#355c8a]"
                    >
                      {entity}
                    </span>
                  ))
                ) : (
                  <span className="text-lg text-[#9a8f81]">
                    未关联人物
                  </span>
                )}
              </div>
            </section>

            <section className="grid gap-5 sm:grid-cols-3">
              <div className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-base font-semibold text-[#7a6f61]">
                  创建时间
                </p>
                <p className="mt-3 text-lg font-bold leading-8 text-[#2d2924]">
                  {formatDateTime(memory.created_at)}
                </p>
              </div>
              <div className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-base font-semibold text-[#7a6f61]">
                  被问次数
                </p>
                <p className="mt-3 text-3xl font-bold text-[#205c4b]">
                  {memory.askedCount} 次
                </p>
              </div>
              <div className="rounded-[28px] border border-[#e4dbcf] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-base font-semibold text-[#7a6f61]">
                  最后被问时间
                </p>
                <p className="mt-3 text-lg font-bold leading-8 text-[#2d2924]">
                  {formatDateTime(memory.lastAskedAt)}
                </p>
              </div>
            </section>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-2xl bg-[#fff0ef] px-5 py-4 text-center text-lg font-bold text-[#a33a31]"
              >
                {errorMessage}
              </p>
            )}

            <section className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setEditError("");
                  setIsEditOpen(true);
                }}
                className="min-h-16 flex-1 rounded-2xl bg-[#205c4b] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#18493c]"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => void deleteMemory()}
                disabled={isDeleting}
                className="min-h-16 flex-1 rounded-2xl bg-[#a33a31] px-6 text-xl font-bold text-white shadow-md transition hover:bg-[#842d26] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "正在删除..." : "删除"}
              </button>
            </section>
          </>
        )}
      </div>

      {isEditOpen && memory && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-edit-title"
            className="w-full max-w-xl rounded-[28px] border border-[#e4dbcf] bg-[#fffdf8] p-5 shadow-2xl sm:p-7"
          >
            <h2
              id="detail-edit-title"
              className="text-3xl font-bold text-[#205c4b]"
            >
              编辑记忆
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveMemory();
              }}
            >
              <textarea
                autoFocus
                rows={5}
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                className="mt-5 w-full resize-none rounded-2xl border-2 border-[#cfc3b3] bg-white px-5 py-4 text-xl leading-8 outline-none focus:border-[#4f8f78] focus:ring-4 focus:ring-[#4f8f78]/20"
              />
              {editError && (
                <p
                  role="alert"
                  className="mt-3 rounded-2xl bg-[#fff0ef] px-4 py-3 text-center text-base font-bold text-[#a33a31]"
                >
                  {editError}
                </p>
              )}
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  disabled={isSaving}
                  className="min-h-14 rounded-2xl border-2 border-[#cfc3b3] bg-white px-7 text-lg font-bold text-[#5f5549]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !editContent.trim()}
                  className="min-h-14 rounded-2xl bg-[#205c4b] px-7 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "正在保存..." : "保存修改"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FamilyNav />
    </main>
  );
}