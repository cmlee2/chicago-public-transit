import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chicago Transit Tracker",
  description: "Real-time CTA bus and train arrivals",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
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
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 md:px-4 md:py-2.5">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 md:gap-3 group">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border-[3px] border-[#00a1de] flex items-center justify-center group-hover:border-white transition-colors shrink-0">
                  <div className="w-4 md:w-5 h-[3px] bg-[#00a1de] rounded-full group-hover:bg-white transition-colors" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-xs md:text-sm font-bold tracking-wide text-white">
                    CHICAGO TRANSIT
                  </span>
                  <span className="text-[9px] md:text-[10px] font-medium tracking-[0.15em] md:tracking-[0.2em] text-[#00a1de] uppercase">
                    Live Tracker
                  </span>
                </div>
              </Link>

              {/* Nav */}
              <div className="flex items-center gap-0.5 md:gap-1">
                <NavLink href="/" label="Map" />
                <NavLink href="/stops" label="Stops" />
                <NavLink href="/favorites" label="Favs" desktopLabel="Favorites" />

                <div className="ml-2 pl-2 md:ml-3 md:pl-3 border-l border-border/50 flex items-center">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="rounded px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-semibold tracking-wide text-[#00a1de] border border-[#00a1de]/30 hover:bg-[#00a1de]/10 transition-colors uppercase">
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

            {/* Live status bar — hidden on mobile */}
            <div className="hidden md:block border-t border-border/30 bg-[#0a0e17]">
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

function NavLink({ href, label, desktopLabel }: { href: string; label: string; desktopLabel?: string }) {
  return (
    <Link
      href={href}
      className="px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-semibold tracking-wider text-muted-foreground hover:text-white hover:bg-white/5 rounded transition-colors uppercase"
    >
      <span className="md:hidden">{label}</span>
      <span className="hidden md:inline">{desktopLabel ?? label}</span>
    </Link>
  );
}
