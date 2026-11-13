import type { Metadata } from "next";
import "./tailwind.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPHEREx Time Machine | Ver el Cielo Moverse",
  description: "Una web donde escribes unas coordenadas o el nombre de una estrella y ves el cielo infrarrojo moverse con los objetos que cambian resaltados.",
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
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#0b0d1c] text-[#f1eefb] selection:bg-[#ff5a7e]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
