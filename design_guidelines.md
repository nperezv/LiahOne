# LiahOne Design Guidelines

## Design Approach
**System-Based Design**: Material Design principles adapted for administrative productivity, prioritizing usability, clarity, and efficient data management over aesthetic experimentation.

**Core Principle**: LiahOne is a utility-first administrative dashboard. Every design decision prioritizes efficiency, learnability, and role-based clarity.

---

## Layout Architecture

### Navigation Structure
**Two-tier navigation system**:
- **Sidebar navigation** (left, fixed): Primary module access (Dashboard, Reunión Sacramental, Consejo, Presidencias, Presupuestos, Entrevistas, Metas, Cumpleaños)
- **Top bar**: User profile, role indicator, notifications, quick actions

**Sidebar specifications**:
- Width: 256px (w-64) desktop, collapsible to icon-only on tablet
- Module icons from Heroicons (outline style)
- Active state: filled background, semibold text
- Nested menus for sub-modules (Presidencias expand to 5 organizations)

### Page Layout Pattern
All administrative pages follow consistent structure:
```
[Top Bar: Breadcrumb | Actions | User]
[Page Title + Description]
[Filter/Search Bar if applicable]
[Content Area: Cards/Tables/Forms]
```

### Spacing System
**Tailwind units**: Consistently use 4, 6, 8, 12, 16, 24 for spacing
- Page padding: `p-6` to `p-8`
- Section gaps: `gap-6`
- Card padding: `p-6`
- Form field spacing: `space-y-4`

---

## Typography

**Font Stack**: Inter (via Google Fonts CDN)
```
Primary: Inter (400, 500, 600, 700)
Fallback: system-ui, sans-serif
```

**Hierarchy**:
- Page titles: `text-2xl font-bold` (2rem)
- Section headers: `text-xl font-semibold` (1.5rem)
- Card titles: `text-lg font-semibold` (1.125rem)
- Body text: `text-base` (1rem)
- Helper text: `text-sm` (0.875rem)
- Labels: `text-sm font-medium`

---

## Component Library

### Dashboard Cards
- Grid layout: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Card structure: Rounded corners `rounded-lg`, subtle border, padding `p-6`
- Card header: Icon + Title (horizontal flex)
- Card body: Metric/chart/list
- Card footer: Action link or timestamp

### Data Tables
- Sticky header row with semibold labels
- Alternating row backgrounds for readability
- Row actions: Iconbuttons (edit, delete) aligned right
- Pagination: Bottom center with page numbers + prev/next
- Mobile: Cards instead of table rows

### Forms
- Vertical layout with clear label positioning above inputs
- Input spacing: `space-y-4`
- Input groups: Related fields in `grid grid-cols-2 gap-4`
- Required indicators: Red asterisk after label
- Field validation: Inline error messages below input
- Form actions: Right-aligned with primary/secondary buttons

### Modals & Dialogs
- Max width: `max-w-2xl` for forms, `max-w-4xl` for complex views
- Backdrop: Semi-transparent overlay
- Header: Title + close button
- Body: Scrollable content area with padding
- Footer: Action buttons right-aligned

### Status Indicators
- Budget states: Pills with icon + text (`rounded-full px-3 py-1`)
  - Solicitado: Neutral
  - Aprobado: Success
  - En Proceso: Warning
  - Completado: Success with checkmark
- Organization health: Traffic light indicators (circles with icons)

### Calendar Components
- Week view for interview scheduling
- Time slot selection: Interactive grid
- Event cards: Compact with time, title, assignee

### PDF Export Views
- Print-optimized layouts with `@media print` styles
- Clear headers with logo/title
- Organized sections with borders
- Signature fields for official documents

---

## Role-Based UI Considerations

**Visual role indicators**:
- Top bar displays current role badge
- Disabled/hidden features based on permissions (no visible locked icons, just hide)
- Obispo view: Access to all modules with edit rights
- Presidente view: Limited to organization-specific sections
- Consejero view: Read-only with comment capabilities clearly marked

**Permission hierarchy visual cues**:
- Edit buttons appear only for authorized roles
- Approval workflows show clear step indicators
- Restricted content: Replace with permission message card

---

## Icons & Assets

**Icon Library**: Heroicons (outline for default, solid for active states)
- Via CDN link
- Consistent sizing: `h-5 w-5` for inline, `h-6 w-6` for standalone buttons

**Images**: None required for administrative interface except:
- User avatars: Circular, 40x40px default
- Organization logos: Small emblems if applicable
- Birthday module: Placeholder for auto-generated celebration graphics

---

## Interaction Patterns

**Minimal animations**:
- Sidebar collapse/expand: Smooth width transition
- Modal entry: Gentle fade + scale
- Dropdown menus: Slide down
- Toast notifications: Slide in from top-right
- **No scroll-triggered or decorative animations**

**Loading states**:
- Skeleton screens for tables/cards
- Spinner for form submissions
- Progress bars for file uploads

---

## Responsive Behavior

- **Desktop (1024px+)**: Full sidebar + multi-column layouts
- **Tablet (768-1023px)**: Collapsible sidebar, 2-column forms
- **Mobile (<768px)**: Hidden sidebar (hamburger menu), single-column everything, bottom navigation for quick access

---

## Accessibility

- WCAG 2.1 AA compliance mandatory
- Keyboard navigation for all interactive elements
- Clear focus indicators (ring offset)
- ARIA labels for icon-only buttons
- Form error announcements for screen readers
- Sufficient touch targets (44x44px minimum)