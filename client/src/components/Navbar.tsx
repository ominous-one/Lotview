import { Link } from "wouter";
import { Phone, MessageSquare, Menu } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import { useTenant } from "@/contexts/TenantContext";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";

const DEFAULT_LOGO = "/lotview-logo.svg";

export function Navbar() {
  const { openChat } = useChat();
  const { dealership } = useTenant();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const logoUrl = dealership?.logo || DEFAULT_LOGO;
  const dealershipName = dealership?.name || "LotView";

  return (
    <nav className="fixed top-0 w-full z-50 bg-background border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer">
            <img 
              src={logoUrl} 
              alt={dealershipName}
              className="h-8 md:h-10 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_LOGO;
              }}
            />
            {!dealership?.logo && (
              <div className="hidden sm:block">
                <h1 className="font-bold text-primary leading-none text-sm md:text-base">
                  {dealershipName.split(' ')[0]?.toUpperCase() || "LOTVIEW"}
                  {dealershipName.split(' ').length > 1 && (
                    <>
                      <br />
                      <span className="text-[10px] tracking-widest opacity-70">
                        {dealershipName.split(' ').slice(1).join(' ').toUpperCase()}
                      </span>
                    </>
                  )}
                </h1>
              </div>
            )}
          </div>
        </Link>

        {/* Desktop Actions */}
        <div className="hidden md:flex gap-3 items-center">
          <ThemeToggle />
          <button 
            onClick={() => openChat()}
            className="bg-background border-2 border-primary text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary hover:text-primary-foreground transition flex items-center gap-2"
            data-testid="button-chat-desktop"
          >
            <MessageSquare className="w-4 h-4" />
            Chat Now
          </button>
          <a 
            href="tel:+16041234567"
            className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-bold hover:bg-secondary/90 transition flex items-center gap-2"
            data-testid="button-phone-desktop"
          >
            <Phone className="w-4 h-4" />
            Contact Sales
          </a>
          <Sheet>
            <SheetTrigger asChild>
              <button
                className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-accent transition"
                data-testid="button-menu-desktop"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-6">
              <div className="flex flex-col gap-4 mt-8">
                <Link href="/login">
                  <button
                    className="w-full bg-primary text-primary-foreground py-3 rounded-lg text-sm font-bold hover:bg-primary/90 transition"
                    data-testid="link-login-menu"
                  >
                    Team Login
                  </button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Mobile Actions */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => openChat()}
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
            data-testid="button-chat-mobile"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <button
                className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center"
                data-testid="button-menu-mobile"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-6">
              <div className="flex flex-col gap-4 mt-8">
                <a
                  href="tel:+16041234567"
                  className="w-full bg-secondary text-secondary-foreground py-3 rounded-lg text-sm font-bold hover:bg-secondary/90 transition flex items-center justify-center gap-2"
                  onClick={() => setIsMenuOpen(false)}
                  data-testid="link-phone-menu"
                >
                  <Phone className="w-4 h-4" />
                  Call: (604) 123-4567
                </a>
                <Link href="/">
                  <button
                    className="w-full bg-background border-2 border-border text-foreground py-3 rounded-lg text-sm font-bold hover:border-primary hover:text-primary transition"
                    onClick={() => setIsMenuOpen(false)}
                    data-testid="link-inventory-menu"
                  >
                    View Inventory
                  </button>
                </Link>
                <Link href="/login">
                  <button
                    className="w-full bg-primary text-primary-foreground py-3 rounded-lg text-sm font-bold hover:bg-primary/90 transition"
                    onClick={() => setIsMenuOpen(false)}
                    data-testid="link-login-menu-mobile"
                  >
                    Team Login
                  </button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
