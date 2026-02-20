# Olympic Auto Group - Digital Flagship Inventory System

## Overview
This project is a full-stack vehicle inventory management system for Olympic Auto Group dealerships. It aims to streamline vehicle sales and customer interaction, enhancing market presence and operational efficiency. The system allows customers to browse inventory, view detailed vehicle information, and calculate financing options across multiple locations. Key features include automated inventory synchronization, view tracking for remarketing, and a customer engagement chatbot. It is designed with a multi-tenant architecture to support single dealerships with future expansion in mind.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, Vite, Wouter, and TanStack Query. It utilizes Shadcn UI (New York style) with Radix UI and Tailwind CSS v4 for a component-based design, supporting custom filtering, a real-time financing calculator, and session-based view tracking. Theming includes a `ThemeProvider` with localStorage persistence, system preference detection, and a `ThemeToggle` for dark mode, ensuring responsiveness across all dashboards.

### Backend
The backend uses Express.js with TypeScript, providing a RESTful API for vehicle CRUD operations, authentication, user management, financing rules, and integrations with Facebook, remarketing platforms, and PBS DMS. It implements a multi-tenant architecture using a Pool Model with shared tables and `dealership_id` filtering, secured by JWT authentication, Role-Based Access Control (RBAC), and Zod schema validation. Data access is managed via an `IStorage` interface, Drizzle ORM, and PostgreSQL (Neon serverless), with all queries filtered by `dealership_id`. Scheduled jobs handle inventory synchronization.

### Database Schema
The database schema includes core tables for `vehicles`, `vehicle_views`, and `filter_groups`, alongside tables for user management (`users`), financing rules (`credit_score_tiers`, `model_year_terms`), and various integrations (`facebook_accounts`, `pbs_config`, `ghl_accounts`, `chat_prompts`). Additional tables support call scoring, admin functionalities, and audit logs. Drizzle Kit is used for migrations, and Zod schemas enforce data validation.

### Development Workflow
The development workflow leverages Vite middleware for Hot Module Replacement (HMR) and esbuild for production bundling. The codebase is organized as a monorepo with shared types, path aliases, and strict TypeScript.

### Role Hierarchy & Access Control
The system defines roles such as `super_admin`, `master`, `admin`, `manager`, and `salesperson`. Authorization is enforced using middleware like `requireRole` for access control and `requireDealership` for multi-tenant data isolation.

### Multi-Tenant Management
The system is production-ready for single dealerships with a `super_admin` role for system-wide administration and "Login As" impersonation. It's designed for future expansion into a multi-tenant SaaS model using a Pool Model.

### Legal Compliance Pages
The platform includes dedicated pages for a Privacy Policy and Terms of Service, covering data handling, integrations, user rights, and service agreements, linked from the main inventory page footer.

## External Dependencies

-   **Database**: Neon Serverless PostgreSQL.
-   **Web Scraping**: ZenRows API, Zyte API, ScrapingBee API, Puppeteer, Browserless.io BrowserQL, Apify for robust, multi-tiered scraping with Cloudflare bypass capabilities.
-   **Data Validation Rules** (Feb 2026): Mandatory validation before saving any scraped vehicle:
    - `validateVehicleData()` function in `robust-scraper.ts` enforces data quality
    - Vehicles that fail validation are REJECTED (not saved) and logged for review
    - **Required Fields**: Year (1990-current+2), make (2+ chars), model (1+ chars)
    - **Price Validation**: Must be $5,000-$500,000 (or null for "Call for Price")
    - **Odometer Validation**: Must be 0-500,000 km; rejects suspicious defaults (100 km, 0 km for used vehicles); null odometer REJECTS used vehicles (extraction must succeed)
    - **Image Validation**: Must have at least 1 valid vehicle photo (blocked patterns filtered)
    - **Image Folder Validation** (Feb 2026): `validateSameFolderImages()` ensures all images come from the same CDN folder (AutoTrader pattern: `/photos/import/YYYYMM/DDDD/FOLDER_ID/`). If images from multiple folders are detected (e.g., mixed with Recommended Vehicles), only images from the folder with the most images are kept.
    - **Recommended Vehicles Exclusion**: Cheerio-based removal of "Recommended Vehicles", "Similar Vehicles", and "Related Vehicles" sections before image extraction
    - **Auto-Clear localImages Cache** (Feb 2026): When `images` array is updated via `updateVehicle()`, the `localImages` field is automatically cleared to prevent stale cached images from being served
    - **CPO Badge Rules**: Only 2022+ Hyundais with < 80,000 km AND known odometer get "Certified Pre-Owned" badge
    - **Extraction Priority**: vdp-price/vdp-odometer hidden inputs → structured data → pattern matching
    - **Return Value**: `vehiclesRejected` count included in scrape results
-   **Authentication**: JWT, bcrypt.
-   **Sales Manager Tools**: NHTSA API (VIN Decoder), MarketCheck API (Market Pricing), Geocoder.ca API (Geocoding).
-   **Cron Scheduling**: Node-cron for inventory synchronization and other background tasks.
-   **AI/LLM**: OpenAI GPT-5 via Replit AI Integrations or dealership-specific OpenAI API keys.
-   **Carfax Integration**: Automated scraping of Carfax badges (from CDN SVG URLs) and report URLs.
    - **Batch Update Endpoint**: `POST /api/vehicles/batch-carfax-update` (manager+ only) - Re-scrapes all VDP pages to extract Carfax badges and URLs, only updating Carfax fields while preserving all other vehicle data
    - **Smart Merge Logic**: Empty Carfax arrays in new scrapes don't overwrite existing badge data
    - **Badge Extraction**: Parses CDN SVG URLs (cdn.carfax.ca/badging/...) for badge types
    - **Fallback UX**: "View Carfax on Dealer Site" button when direct Carfax report URL unavailable
-   **Facebook Integration**: OAuth 2.0, Graph API for page management, posting, and Facebook Catalog API.
-   **PBS Partner Hub API**: Integration with PBS DMS for session, sales, service, and parts management, including caching and retry logic.
-   **FWC CRM Integration**: Integration with Framework Consulting Software for contacts, calendars, opportunities, and conversations, with webhook handling and bidirectional sync.
-   **Facebook Messenger Conversations**: Integration for a split-view inbox with role-based access and FWC synchronization.
-   **Real-Time Notifications**: WebSocket notifications for new messages and conversation updates.
-   **Call Scoring & Coaching System**: Department-specific scoring templates with weighted criteria, AI draft scores, speaker recognition, and speaking time analysis.
-   **Chrome Extension** (Lotview Auto Poster v1.2.0): A Chrome extension for salespeople to post vehicles to Facebook Marketplace with one-click form filling, image upload, and posting history tracking.
    - **Form Filling**: Auto-fills all 16 Facebook Marketplace vehicle form fields: Vehicle type, Year, Make, Model (with trim), Mileage, Body style, Exterior color, Interior color, Clean title, Vehicle condition, Fuel type, Transmission, Price, Description, Location, and Photos (up to 20)
    - **Model Dropdown Fix** (Jan 2026): Tries multiple model variations (full model+trim, base model, first word) with Make re-click between attempts for cascading dropdown refresh
    - **Photo Upload**: Enhanced 3-method file input detection (standard inputs, click photo area, hidden inputs) with drag-drop fallback
    - **Price Field**: 4 detection methods (label text search, fillTextInput, standard selectors, numeric inputmode search)
    - **Value Normalization**: Normalizes scraped colors, fuel type, and transmission to match Facebook's dropdown options (e.g., "Gasoline" from "Gas", "Gray" from "Charcoal Grey")