# Changelog

All notable changes to the Lotview Auto Poster Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-01-20

### Security Improvements
- **Server-Side HMAC Validation**: Added middleware with nonce/timestamp replay protection
- **Server-Side Posting Limits**: One-time posting tokens prevent client-side bypass
- **Enhanced XSS Sanitization**: Expanded blocking for iframe, style, object, embed, encoded entities
- **GDPR Consent Banner**: Explicit opt-in required before any data collection or storage

### Infrastructure
- **Jest Tests Fixed**: All 50 tests passing with 87% statement coverage
- **GitHub Actions CI**: Workflow for build, test, security audit, manifest validation

## [0.7.0] - 2026-01-20

### Security (10/10 Hardening)
- **XSS Prevention**: Added HTML entity encoding for all vehicle data before DOM injection
- **Input Sanitization**: sanitizeFormData() and sanitizeTemplateOutput() strip scripts, event handlers
- **Request Signing**: HMAC-SHA256 signatures with nonce/timestamp on all API requests
- **Token Encryption**: AES-GCM encryption for tokens stored in chrome.storage
- **Token Refresh**: Silent token refresh at 7.5 hours with 8-hour expiry
- **Narrowed Permissions**: Removed activeTab, restricted host_permissions to exact Facebook/API paths
- **Content Security Policy**: Added strict CSP (script-src 'self'; object-src 'none')

### Added
- **Resilient Form Filling**: MutationObserver-based selector with self-healing retry logic
- **Offline Detection**: Network status checks with structured error codes
- **Retry with Backoff**: Automatic retry for transient failures (network, 5xx errors)
- **Privacy Features**: 30-day history auto-purge, data export, Clear All Data button
- **Privacy Policy Link**: Links to lotview.ai/privacy in History tab

### Changed
- Manifest v0.7.0 with tighter permissions
- Build system injects __DEV__ flag for dev/prod separation
- Dev builds use manifest.dev.json with localhost/Replit URLs

### Technical
- Added errors.ts with ErrorCode enum and structured error handling
- Added crypto.ts for HMAC signing and AES token encryption
- Added sanitize.ts for XSS prevention utilities
- Added comprehensive Jest test suite for validators, sanitizers, errors

## [0.6.0] - 2026-01-15

### Security
- Image host allowlist (lotview.ai, olympicautogroup.ca, CDN domains)
- 10 images max, 10MB/image, 50MB total size limits
- Content-type image/* validation
- HTTPS enforcement for all production requests
- Token stored in chrome.storage.session with 8-hour expiry

### Added
- Runtime validators for all API responses
- Required field enforcement (title/description must exist)
- Race-proof history updates using storage-first pattern
- Warning toasts for template/limits fetch failures

### Changed
- Production builds block localhost URLs
- Separate manifest.json (prod) and manifest.dev.json (dev)

## [0.5.0] - 2026-01-10

### Added
- Multi-strategy form filling with fallback selectors
- Duplicate detection with visual warnings
- Daily posting limit enforcement
- Template preview before posting

### Changed
- Improved error messages for Facebook layout changes
- Better handling of missing vehicle data

## [0.4.0] - 2026-01-05

### Added
- Facebook driver with content script injection
- Image upload support (up to 10 photos)
- Posting history tracking
- Server URL configuration

### Security
- JWT authentication with httpOnly patterns
- Sender ID validation in message handlers

## [0.3.0] - 2025-12-28

### Added
- Vehicle search with VIN/stock/make/model filters
- Template system with placeholders
- Role-based feature access

## [0.2.0] - 2025-12-20

### Added
- Login/logout flow
- Session persistence
- Basic popup UI

## [0.1.0] - 2025-12-15

### Added
- Initial extension scaffold
- Manifest V3 configuration
- Background service worker
- React popup framework
