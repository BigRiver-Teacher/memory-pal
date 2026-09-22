import FamilyNav from "@/components/FamilyNav";

export default function FamilySettingsPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f3ea] text-[#2d2924]">
      <section className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full rounded-[28px] border border-[#e4dbcf] bg-[#fffdf8] px-6 py-12 text-center shadow-sm sm:px-10">
          <p className="text-lg font-semibold text-[#7a6f61]">
            忆伴 · 家属端
          </p>
          <h1 className="mt-3 text-4xl font-bold text-[#205c4b]">
            设置
          </h1>
          <p className="mt-5 text-xl leading-9 text-[#8b7f70]">
            设置页开发中
          </p>
        </div>
      </section>

      <FamilyNav />
    </main>
  );
}