import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import Link from "next/link";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chicago Transit Tracker",
  description: "Real-time CTA bus and train arrivals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={cn("font-sans", geist.variable)}>
        <body>
          <header className="border-b bg-background">
            <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <Link href="/" className="text-lg font-bold">
                Chicago Transit Tracker
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  href="/favorites"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Favorites
                </Link>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </nav>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
