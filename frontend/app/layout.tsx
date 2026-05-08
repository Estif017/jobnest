import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Sidebar from "@/components/Sidebar";
import ThemeProvider from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "JobNest",
  description: "AI-powered job application tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent FOUC — apply stored theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t===null&&d))document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans bg-base text-ink antialiased`}>
        <ThemeProvider>
          <Providers>
            <Sidebar />
            <main className="ml-60 min-h-screen p-8">{children}</main>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
