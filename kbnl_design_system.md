# KbNL Admin Dashboard Design System

## Design Philosophy
Modern, clean UI with intentional spacing. All sections follow the **view toggle pattern** (card + table modes) to empower users. Tighter on mobile, generous on desktop.

---

## Color Palette
- **Primary:** #0070f3 (blue accents, active states, CTAs)
- **Dark:** #171717 (text, serious actions)
- **Background:** #f8fafc (page bg)
- **Surface:** white (cards, modals, panels)
- **Borders:** #e2e8f0 (light dividers)
- **Text (primary):** #0f172a
- **Text (secondary):** #64748b
- **Text (tertiary):** #94a3b8
- **Success/Edit:** #0070f3 (light: #f0f7ff)
- **Danger/Delete:** #ef4444 (light: #fef2f2)

---

## Typography Scale (Fixed)

```js
const fontSize = {
  xs: 12,   // meta, captions, pill labels
  sm: 13,   // input labels, table headers
  base: 14, // body text, secondary info
  md: 15,   // button text, actions
  lg: 16,   // list items, card titles
  xl: 20,   // modal titles
  "2xl": 24, // page title (mobile)
  "3xl": 28  // page title (desktop)
}
```

**Usage:**
- Page titles: 28px (desktop), 24px (mobile)
- Modal titles: 20px
- Card titles / List items: 16px
- Body text / Labels: 14px
- Metadata / Captions: 12px

All text uses `fontFamily: "'Inter', sans-serif"`

---

## Spacing & Sizing

### Padding Standards
- **Page padding:** 32px (desktop), 16px (mobile)
- **Card padding:** 16px (mobile), 20px (desktop)
- **Modal padding:** 32px (desktop), 28px 20px (mobile)
- **Input padding:** 12px 14px (vertical 12, horizontal 14)
- **Button padding:** 
  - Large (modal CTA): 12px 16px (minHeight: 44px)
  - Medium (card action): 8px 12px (minHeight 32px)
  - Small (table action): 6px 10px (minHeight 32px)

### Gap Standards
- **Section gaps:** 32px (header to content)
- **Card gaps:** 12px (mobile), 16px (desktop)
- **Button gaps:** 6-8px
- **Form field gaps:** 14px

### Border Radius
- **Page containers:** 12px
- **Cards:** 12px
- **Modals:** 12px (desktop), 20px 20px 0 0 (mobile bottom sheet)
- **Buttons:** 8px (primary), 6px (secondary)
- **Inputs:** 8px
- **Avatars:** 50% (circles)

### Min Heights
- **Input fields:** 48px
- **Buttons (primary/modal):** 44px
- **Buttons (secondary):** 32px
- **Icon buttons:** 40px minimum (48px preferred)

---

## Component Patterns

### View Toggle (Card/Table)
**Location:** Header, right of title, before Add button

**States:**
- Inactive: transparent bg, gray text (#64748b)
- Active: #0070f3 bg, white text

**Behavior:**
- Only shows when list has items
- Icons: grid icon (card), lines icon (table)
- Size: 40px height, flex layout

```jsx
<div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
  <button
    onClick={() => setViewMode("card")}
    style={{
      padding: "8px 12px",
      background: viewMode === "card" ? "#0070f3" : "transparent",
      color: viewMode === "card" ? "white" : "#64748b",
      border: "none",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 600,
      minWidth: 44,
      height: 40,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >
    {/* Grid icon */}
  </button>
  {/* Table button same pattern */}
</div>
```

### Add/Primary Button
**Colors:**
- Background: #0070f3
- Hover: translateY(-2px) on desktop (shadow increase)
- Icon + text on desktop, full width on mobile

**Size:**
- Desktop: 12px vertical padding, auto width
- Mobile: 10px vertical padding, flex: 1

---

## Card View (List Mode)

### Card Container
```jsx
{
  background: "white",
  borderRadius: 12,
  padding: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
  transition: "all 0.2s ease",
  // On hover:
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
  borderColor: "#cbd5e1"
}
```

### Card Header (with Avatar)
- Avatar: 40px circle, gradient background
- Title: 16px, #0f172a, ellipsis if needed
- Subtitle: 13px, #64748b
- Gap between avatar and text: 12px

### Card Actions
- Grid: 2 columns, 8px gap (mobile), full width buttons
- Padding: 8px 12px per button
- Colors: 
  - Edit: #0070f3 text, #f0f7ff bg, hover #e0efff
  - Delete: #ef4444 text, #fef2f2 bg, hover #fee2e2
- Margin top: 12px from content

---

## Table View

### Header Row
- Background: #f8fafc
- Border: 1px solid #e2e8f0
- Padding: 12px 16px
- Font: 12px uppercase, #64748b, 600 weight, 0.5px letter-spacing

### Data Rows
- Padding: 12px 16px
- Border: 1px solid #e2e8f0 (except last row)
- Hover: background #f8fafc
- Avatar: 36px circle
- Text: 14px body, 13px secondary

### Table Actions
- Gap: 6px (tighter than cards)
- Button padding: 6px 10px
- Same color scheme as cards but smaller

---

## Modal System

### Base Modal
- **Desktop:** centered, 420px max-width
- **Mobile:** bottom sheet, full width, 90vh max-height
- Border radius: 12px (desktop), 20px 20px 0 0 (mobile)
- Padding: 32px (desktop), 28px 20px (mobile)
- Backdrop: rgba(15, 23, 42, 0.6) with blur(4px)

### Modal Header
- Title: 20px, #0f172a, 700 weight
- Close button: 32px square, 20x20 icon, #94a3b8 text, hover #64748b

### Modal Form Fields
- Gap between fields: 14px
- Label: 13px, #475569, 500 weight, margin-bottom 6px
- Input: standard style (see above)
- Message (error): padding 12px, #fef2f2 bg, #ef4444 left border (4px), #b91c1c text, 13px

### Modal Actions
- Button (primary): full width, 12px 16px padding, 44px min-height
- Button (secondary in delete): grid 2-column, 10px gap, both 44px min-height

---

## Filter Pills (Future Implementation)

### Color Reference
**Manage Trucks:**
- All: #000 / #171717
- Empty: #10b981 (green)
- Loaded: #0070f3 (blue)
- Repairs: #f59e0b (yellow)
- Decommissioned: #ef4444 (red)

**Complaints:**
- All: #171717 (black)
- Resolved: #0070f3 (blue)
- Unresolved: #f59e0b (yellow)

**Pattern:** Pill-shaped buttons, 12px font, tight padding (6px 12px), borders match text color (opacity 0.2), text is the color, background is light version (opacity 0.1).

---

## Responsive Rules

### Mobile-First (`isMobile < 640px`)
- Full-width buttons (flex: 1)
- Cards default (table option via toggle)
- 16px page padding
- 20px modals (bottom sheet)
- 12px button padding
- Icons in toolbars reduce padding (8px 12px)
- Tighter gap everywhere (12px default)

### Desktop (`isDesktop >= 640px`)
- Side-by-side layouts
- Table default option
- 32px page padding
- 32px modal padding
- Generous gaps (16px default)
- Hover states active

---

## Implementation Checklist for Each Section

- [ ] Update primary color to #0070f3
- [ ] Implement fixed fontSize object
- [ ] Add view toggle (card/table)
- [ ] Rebuild card view with 40px avatars, 16px titles
- [ ] Rebuild table with tighter buttons (6px 10px)
- [ ] Ensure action buttons have 6-8px gaps (not stacking)
- [ ] Modal padding: 32px (desktop), 28px 20px (mobile)
- [ ] Button min-height: 44px for primary, 32px for secondary
- [ ] Check that all text uses fixed fontSize scale
- [ ] Test on mobile < 640px and desktop >= 640px

---

## Quick Copy-Paste Patterns

### View Toggle
```jsx
const [viewMode, setViewMode] = useState<ViewMode>("card")

// In JSX header:
{items.length > 0 && (
  <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
    <button
      onClick={() => setViewMode("card")}
      style={{
        padding: "8px 12px",
        background: viewMode === "card" ? "#0070f3" : "transparent",
        color: viewMode === "card" ? "white" : "#64748b",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: fontSize.xs,
        fontWeight: 600,
        minWidth: 44,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      {/* Grid icon */}
    </button>
    <button /* table */ />
  </div>
)}

// Render based on mode:
{viewMode === "card" && <CardView />}
{viewMode === "table" && <TableView />}
```

### Card Action Button Pair
```jsx
<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
  <button
    style={{ flex: 1, padding: "8px 12px", cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: "#f0f7ff", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }}
  >
    Edit
  </button>
  <button
    style={{ flex: 1, padding: "8px 12px", cursor: "pointer", borderRadius: 6, border: "1px solid #fee2e2", color: "#ef4444", background: "#fef2f2", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }}
  >
    Delete
  </button>
</div>
```

---

## Sections to Apply This To (In Order)

1. ✅ Manage Brokers (DONE - template)
2. Station Managers (same as brokers)
3. Truck Officers (same as brokers)
4. Truck Admins (same as brokers)
5. Store Officers (same as brokers)
6. Cash Officers (same as brokers)
7. Manage Trucks (add filter pills: All black, Empty green, Loaded blue, Repairs yellow, Decommissioned red) - DONE
8. Manage Drivers (same card/table structure) - DONE
9. Monitor Trucks (card/table, filter pills) - DONE
10. Monitor Trips (card/table, filter pills)
11. Complaints (card/table, filter pills: All black, Resolved blue, Unresolved yellow)
12. Tricycles (card/table)
13. Diesel Manager (special layout - needs spacing redesign)
14. Customer Payments (card/table)
15. Cash Transactions (already has good pills, optimize spacing)
16. Report (reorganize UI, fix range filters)

### Extra stuff to note
1. View toggle, demure pills, card/table, fixed typography, design system modals
2. Pills: All (#171717), Active (#16a34a green), Invited (#f5a623), Suspended (#ef4444), purple comes in somewhere you'll see.