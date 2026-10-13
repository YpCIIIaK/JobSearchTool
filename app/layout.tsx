import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobFinder",
  description: "Локальный агрегатор удалённых вакансий с ИИ-оценкой",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="h-dvh flex flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-line bg-panel flex items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid place-items-center size-7 rounded-lg bg-accent text-accent-fg text-sm">JF</span>
            JobFinder
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-raised">
              Вакансии
            </Link>
            <Link href="/settings" className="px-3 py-1.5 rounded-md hover:bg-raised">
              Настройки
            </Link>
          </nav>
          <span className="ml-auto text-xs text-muted hidden md:block">
            Клавиши: <kbd>J</kbd>/<kbd>K</kbd> — навигация · <kbd>S</kbd> сохранить · <kbd>H</kbd> скрыть · <kbd>A</kbd> ИИ ·{" "}
            <kbd>O</kbd> открыть
          </span>
        </header>
        <main className="flex-1 min-h-0">{children}</main>
      </body>
    </html>
  );
}
