import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

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
      <html lang="en">
        <body>
          <header className="border-b border-border/50 bg-[#0d1220]">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
              {/* Logo — CTA roundel inspired */}
              <Link href="/" className="flex items-center gap-3 group">
                <div className="relative flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full border-[3px] border-[#00a1de] flex items-center justify-center group-hover:border-white transition-colors">
                    <div className="w-5 h-[3px] bg-[#00a1de] rounded-full group-hover:bg-white transition-colors" />
                  </div>
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-bold tracking-wide text-white">
                    CHICAGO TRANSIT
                  </span>
                  <span className="text-[10px] font-medium tracking-[0.2em] text-[#00a1de] uppercase">
                    Live Tracker
                  </span>
                </div>
              </Link>

              {/* Nav links — transit sign style */}
              <div className="flex items-center gap-1">
                <NavLink href="/" label="Map" />
                <NavLink href="/stops" label="Stops" />
                <NavLink href="/favorites" label="Favorites" />

                <div className="ml-3 pl-3 border-l border-border/50 flex items-center">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="flex items-center gap-2 rounded px-3 py-1.5 text-xs font-semibold tracking-wide text-[#00a1de] border border-[#00a1de]/30 hover:bg-[#00a1de]/10 transition-colors uppercase">
                        Sign in
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <UserButton />
                  </SignedIn>
                </div>
              </div>
            </nav>

            {/* Live status bar */}
            <div className="border-t border-border/30 bg-[#0a0e17]">
              <div className="mx-auto max-w-6xl px-4 py-1 flex items-center gap-2">
                <span className="status-dot live" />
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Live — Tracking CTA buses &amp; trains in real time
                </span>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground hover:text-white hover:bg-white/5 rounded transition-colors uppercase"
    >
      {label}
    </Link>
  );
}
