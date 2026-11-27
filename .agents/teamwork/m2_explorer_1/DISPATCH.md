## 2026-11-12T15:41:55Z
You are an Explorer for Milestone 2: Youth-First Attendance & UI Compliance in the RCCG Jesus Covenant Zone CMS.

MANDATORY FIRST STEP:
Read the verbatim user request at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture and milestone scope at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md

YOUR STATE FOLDER:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_1/

YOUR OBJECTIVE:
Investigate and design the Attendance UI Component Architecture for Milestone 2:
1. Analyze existing `app/page.tsx`, `app/components/`, `app/actions/attendance.ts`, and existing dependencies in `package.json`.
2. Design the component structure for the Youth-First Attendance portal:
   - Header with prominent official RCCG logo (`/rccg-logo.png`), service status banner (using `lib/service-resolver.ts`), and geofence status indicator.
   - 1-Tap Remembered Profile: check `localStorage` key (`rccg_saved_member`), show instant check-in button if present, with "Not you? Switch account" option.
   - Tabbed Interface:
     - Tab 1: QR Code Scanner (investigate QR scanning libraries suitable for Next.js 16/React 19 such as `html5-qrcode` or a lightweight canvas/video stream reader with dynamic import/SSR safe wrapper; provide fallback manual QR code input or 4-digit switch).
     - Tab 2: 4-Digit Phone Lookup with rapid numeric keypad / input, instant debounced match, and collision disambiguation list (showing masked name/category if multiple members share last 4 digits).
   - Check-in Confirmation Screen: celebration state with checkmark, member name, service title, and timestamp.
3. Determine required UI dependencies and shadcn primitives needed (e.g., `framer-motion`, `clsx`, `tailwind-merge`, `lucide-react`, button, input, card, tabs, dialog).
4. Provide concrete implementation blueprint, file boundaries, and step-by-step instructions for the Worker.
5. DO NOT modify any code files directly. Write your complete handoff report to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_1\handoff.md` and send a summary message when complete.
