# LiahOne - Administrative Management System

## Overview

LiahOne is a comprehensive web and mobile application designed to centralize and streamline all administrative, management, and coordination functions for church wards. It provides a unified platform for managing meetings, presidencies, councils, budgets, interviews, goals, activities, birthdays, and assignments. The system emphasizes efficiency, clarity, and robust role-based access control, adhering to a utility-first design based on Material Design principles. The application is built for self-hosted deployment on RHEL 9.5 servers and supports both web and future mobile interfaces.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The web application is built with React and TypeScript, leveraging Vite for development and optimized builds. Styling is handled by Tailwind CSS, incorporating a custom design system based on Material Design principles. UI components utilize Radix UI primitives with shadcn/ui. State management is managed by TanStack React Query for server state caching, and Wouter is used for lightweight client-side routing. Forms are managed with React Hook Form, validated by Zod schemas. PDF generation uses jsPDF. The design system features the Inter font family, HSL-based CSS custom properties for color, a two-tier navigation layout, and configurable dark mode support. A mobile application using React Native with Expo is planned.

### Backend Architecture

The backend runs on Node.js with TypeScript, using Express.js for HTTP APIs and routing. Session management is handled by `express-session` with a PostgreSQL store, and authentication uses session-based mechanisms with bcrypt for password hashing. The API design is RESTful. The architecture separates client and server build pipelines (Vite for client, esbuild for server) and includes a business logic layer with storage abstraction and granular role-based access control.

### Data Storage

The system uses PostgreSQL, with Neon serverless driver integration, and Drizzle ORM for type-safe queries and schema management. Drizzle Kit handles migrations. The data model includes users with role-based organization affiliations, various meeting types, financial tracking, administrative functions (interviews, goals, assignments), social features (birthdays), activities, customizable PDF templates, and user session data. Schema features include enum types, JSONB columns, timestamp tracking, and foreign key relationships, with Zod schemas generated from Drizzle for runtime validation.

### API Structure

Endpoints are organized by resource, including authentication, dashboard statistics, CRUD operations for all 13 modules (Sacramental Meetings, Ward Councils, Presidency Meetings, Budget Requests, Interviews, Goals, Birthdays, Activities, Assignments, Users, Organizations, Integrated Calendar Events, Reports, PDF Templates, and Reminders). Responses are JSON-formatted, with consistent HTTP status codes and error handling. Query invalidation on mutations ensures cache synchronization.

### Key Features and Implementations

- **13 Core Modules:** Dashboard, Sacramental Meeting, Ward Council, Presidency Meetings, Budget Requests, Interviews, Goals, Birthdays, Activities, Calendar, Reports, Assignments, Settings.
- **Role-Based Access Control (RBAC):** Granular permissions for Obispo, Consejero del Obispo, Secretario, and Presidente de Organización, affecting sidebar visibility, content filtering, and module access. Organization presidents see only their specific data.
- **Data Export & PDF Generation:** Excel (CSV) export for all modules and dynamic, customizable PDF generation for key documents (Sacramental Meetings, Ward Councils).
- **Automation:** Automatic reminder system for interviews and assignments, controllable by admins.
- **Authentication & Security:** Session-based authentication, bcrypt hashing, HTTP-only cookies, and role-based middleware for protected routes.

## External Dependencies

- **Database:** PostgreSQL (self-hosted or Neon serverless)
- **Frontend Libraries:** React, Vite, Tailwind CSS, Radix UI, shadcn/ui, TanStack React Query, Wouter, React Hook Form, Zod, jsPDF, lucide-react.
- **Backend Libraries:** Node.js, Express.js, `express-session`, `connect-pg-simple`, bcrypt, drizzle-orm, drizzle-kit, @neondatabase/serverless.
- **Fonts:** Google Fonts CDN (Inter font).
- **Planned Integrations:** SMTP server for email notifications, push notification service for mobile.