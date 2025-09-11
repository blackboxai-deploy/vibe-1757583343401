import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Happy Bubble Shooter 🎯",
  description: "A fun and addictive bubble shooter game with colorful graphics, power-ups, and endless levels. Match 3 or more bubbles to pop them and achieve high scores!",
  keywords: "bubble shooter, puzzle game, match 3, casual game, mobile game",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}