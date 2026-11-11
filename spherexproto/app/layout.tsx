import type { Metadata } from "next";
import "./tailwind.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPHEREx Time Machine | Explorador del Cielo Infrarrojo en Movimiento",
  description: "Visualizador astronómico interactivo de cielo infrarrojo temporal con SPHEREx, detección de movimiento propio, espectros de 102 bandas y modo detective.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
