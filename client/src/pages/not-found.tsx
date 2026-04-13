import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Car, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <Car className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-6xl font-black text-foreground mb-2">404</h1>
        <h2 className="text-2xl font-bold text-foreground mb-3">Page not found</h2>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button className="gap-2">
              <Search className="w-4 h-4" />
              Browse Inventory
            </Button>
          </Link>
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
