import type { Metadata } from "next";
import "./tailwind.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPHEREx Time Machine | Compara el cielo infrarrojo",
  description: "Compara observaciones infrarrojas de SPHEREx tomadas en distintas fechas, con procedencia científica y simulación educativa separadas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#0b0d1c] text-[#f1eefb] selection:bg-[#ff5a7e]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
