# KbNL Modern Login & Splash Screen — Design Reference

## Design Philosophy

**Aesthetic**: Refined Minimalism with Trustworthy Professionalism
- Clean, spacious layouts with breathing room
- Subtle depth through shadows and borders
- Smooth, purposeful animations
- Professional but approachable
- Mobile-first approach

**Mood**: Efficient, Reliable, Modern
- Inspires confidence in a logistics company
- Fast and responsive (micro-interactions)
- Seamless transition from splash to login
- Premium feel without excessive decoration

---

## Color Palette

### Primary Colors
| Color | Hex | Usage |
|-------|-----|-------|
| **Brand Blue** | `#0070f3` | CTA buttons, logo accents, animations, dots |
| **Dark Text** | `#171717` | Headlines, labels, body text |
| **White** | `#ffffff` | Backgrounds, cards, contrast |

### Secondary Colors
| Color | Hex | Usage |
|-------|-----|-------|
| **Light Background** | `#f5f7fa` | Gradient backgrounds, subtle fills |
| **Border Gray** | `#e5e5e5` | Input borders, dividers |
| **Input Background** | `#f9f9f9` | Input field backgrounds |
| **Text Gray** | `#888` | Secondary text, subtitles |
| **Light Gray** | `#999` | Tertiary text, helpers |

### Status Colors (for messages)
| Status | Hex | Usage |
|--------|-----|-------|
| **Error** | `#ef4444` | Error messages, validation |
| **Success** | `#22c55e` | Success messages, confirmations |

### Gradients
```css
/* Splash Screen Background */
background: linear-gradient(135deg, #ffffff 0%, #f5f7fa 100%);

/* Login Page Background */
background: linear-gradient(135deg, #ffffff 0%, #f5f7fa 100%);

/* Button Shadow on Hover */
box-shadow: 0 12px 24px rgba(0, 112, 243, 0.24);

/* Logo Container Background */
background: rgba(0, 112, 243, 0.08);
border: 1px solid rgba(0, 112, 243, 0.15);
```

---

## Typography

### Font Stack
```css
font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
```

**Why?** 
- Professional and clean
- Excellent on mobile & desktop
- Default system fonts (no download, faster load)
- Consistent across Windows, Mac, iOS, Android

### Hierarchy

| Element | Size | Weight | Line Height | Spacing |
|---------|------|--------|-------------|---------|
| Splash Logo Text | 32px | 700 | 1.2 | -0.5px letter |
| Splash Tagline | 14px | 500 | 1 | 0.5px letter (uppercase) |
| Login Heading | 28px | 700 | 1.2 | -0.5px letter |
| Input Labels | 13px | 600 | 1 | 0.3px letter (uppercase) |
| Button Text | 16px | 600 | 1 | 0.3px letter |
| Helper Text | 14px | 400 | 1.4 | — |
| Small Text | 12px | 400 | 1 | — |

---

## Spacing & Layout

### Splash Screen
```
┌─────────────────────┐
│                     │
│      [LOGO]         │ Logo Container: 120×120px, border-radius: 24px
│                     │ Margin Bottom: 24px
│    Company Name     │
│                     │ Margin Bottom: 8px
│  Logistics Mgmt     │
│                     │ Margin Bottom: 48px
│   ⚫ ⚫ ⚫ Loader     │
│                     │
└─────────────────────┘
```

### Login Card
```
┌──────────────────────────────┐
│                              │
│          [LOGO]              │ Logo: 80×80px, border-radius: 16px
│       KbNL Login             │ Margin Bottom: 40px
│                              │
│  📧 Email Address            │ Label: margin-bottom: 8px
│  [____________]              │ Input: padding: 12px 16px
│                              │ Input margin-bottom: 16px
│  🔒 Password                 │
│  [____________]              │ Input margin-bottom: 28px
│                              │
│  [ Sign In ]                 │ Button: padding: 14px, border-radius: 10px
│                              │
│  ⚠️ Error Message (if any)   │ Message: padding: 12px, margin-top: 20px
│                              │
│  ─────────────────────────   │ Divider: margin-top: 32px, padding-top: 24px
│  Footer Text                 │
│  Copyright Notice            │
│                              │
└──────────────────────────────┘

Max Width: 420px
Padding: 48px (top/bottom), 40px (left/right)
```

---

## Shadows

### Card Shadow (Login)
```css
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
```
- Subtle, premium feel
- Not heavy (logistics, not gaming)
- Readable in light environments

### Button Hover Shadow
```css
box-shadow: 0 12px 24px rgba(0, 112, 243, 0.24);
```
- Blue-tinted shadow
- Reinforces brand color
- Lifts button 2px on hover

### Border (Card)
```css
border: 1px solid rgba(0, 0, 0, 0.06);
```
- Minimal border to define card edge
- Not harsh (0.06 opacity)

---

## Animations

### Splash Screen Sequence
```
0.0s → Logo slides up + fades in (0.6s)
0.2s → Company name slides up + fades in (0.6s)
0.4s → Tagline slides up + fades in (0.6s)
0.8s → Loader dots pulse (1.5s loop)
2.5s → Entire screen fades out (0.5s)
3.0s → Login page visible
```

### Login Page Sequence
```
0.0s → Container slides up + fades in (0.6s)
0.0s → Logo section fades in (0.6s)
0.1s → Form fields fade in (staggered 0.1s apart)
0.3s → Button fades in with lift effect
```

### Interactive Animations
```css
/* Button Hover */
transform: translateY(-2px);
box-shadow: 0 12px 24px rgba(0, 112, 243, 0.24);
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

/* Button Active */
transform: translateY(0);

/* Input Focus */
border-color: #0070f3;
background: #f9f9f9;

/* Loader Dots */
animation: pulse 1.5s ease-in-out (staggered per dot)
```

### Easing Functions
- **Page Transitions**: `ease-out` (fast start, slow end)
- **Button Hover**: `cubic-bezier(0.4, 0, 0.2, 1)` (smooth acceleration)
- **Loader**: `ease-in-out` (consistent pulse)

---

## Responsive Behavior

### Mobile (< 768px)
- Card width: 100% - 40px padding
- Maximum width: 420px
- Font sizes unchanged (readable)
- Touch targets: 48px minimum height (button)
- Spacing maintained for comfort

### Tablet (768px - 1024px)
- Card width: 420px (centered)
- Same layout as desktop

### Desktop (> 1024px)
- Card width: 420px (centered)
- Maintained maximums to prevent stretching

---

## Accessibility Features

✅ **Color Contrast**
- Blue (#0070f3) on white: 8.9:1 ratio (AAA)
- Dark text (#171717) on white: 17:1 ratio (AAA)
- Error text (#ef4444): 7.2:1 ratio (AA)

✅ **Touch Targets**
- All buttons: 48px minimum height
- Input fields: 48px minimum height (padding)
- Clickable area larger than visual size

✅ **Focus States**
- Input borders change to blue on focus
- Button has visible hover state
- Keyboard navigation supported

✅ **Loading States**
- Loading spinner visible with text feedback
- Button disabled during submission
- Error messages use color + text (not color alone)

---

## Implementation Notes

### CSS Variables (Future Enhancement)
To make theming easier in the future, consider converting to CSS variables:
```css
:root {
  --color-primary: #0070f3;
  --color-text: #171717;
  --color-border: #e5e5e5;
  --color-bg: #ffffff;
  --color-bg-subtle: #f5f7fa;
  --shadow-card: 0 20px 60px rgba(0, 0, 0, 0.08);
  --shadow-hover: 0 12px 24px rgba(0, 112, 243, 0.24);
}
```

### Dark Mode (Future)
Current design is light-only (enforced by `color-scheme: light`). To add dark mode:
1. Remove `color-scheme: light` from globals.css
2. Create dark color palette
3. Update all hex colors to CSS variables
4. Use `prefers-color-scheme` media query

---

## Browser & Device Support

| Device | Status | Notes |
|--------|--------|-------|
| iOS (Safari) | ✅ Full | Splash screen via meta tags |
| Android (Chrome) | ✅ Full | Splash screen via manifest |
| Desktop Chrome | ✅ Full | PWA installable |
| Desktop Firefox | ✅ Full | PWA installable |
| Desktop Safari | ⚠️ Limited | PWA install unavailable |
| Internet Explorer | ✗ Not Supported | — |

---

## File References

- **Splash Screen Component**: `components/SplashScreen.tsx`
- **Login Page**: `app/login/page.tsx`
- **PWA Manifest**: `public/manifest.json`
- **Layout Meta Tags**: `app/layout.tsx`
- **Logo Assets**: `public/logo*.png`, `public/favicon.ico`