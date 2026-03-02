import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AppToaster } from "@/components/ui/toaster";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Invoice Tool",
  description: "Gestion de factures et devis pour freelance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={manrope.className}>
        <ThemeProvider>
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
