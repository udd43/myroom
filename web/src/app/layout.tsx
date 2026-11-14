import type { Metadata, Viewport } from "next";
import QueryProvider from "@/components/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyRoom — 집 보러 다니며 남기는 3D 기록",
  description: "집 내부를 스캔해 3D로 저장하고, 일조·시세·하자 증거까지 한 번에 비교합니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f6f9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
