import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-geist-mono" });
const serif = Source_Serif_4({ subsets: ["latin", "cyrillic"], axes: ["opsz"], variable: "--font-serif-src" });

export const metadata: Metadata = {
  title: "JobSearch",
  description: "Локальный агрегатор удалённых вакансий с ИИ-оценкой",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${geist.variable} ${geistMono.variable} ${serif.variable}`}>
      <body className="h-dvh flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0">{children}</main>
      </body>
    </html>
  );
}
