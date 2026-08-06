import re

# Read styles.css
with open('d:/Python Projects/Moneta - Copy/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update legacy vars
css = re.sub(r':root \{[\s\S]*?\}', '''
:root {
  /* Bridging to tokens.css */
  --bg:          var(--color-background, #0D0D0F);
  --surface-1:   var(--color-surface, #1A1A1F);
  --surface-2:   var(--color-surface, #1A1A1F);
  --surface-3:   var(--color-elevated, #222228);

  /* Accents */
  --blue:        var(--color-info, #4F8CFF);
  --blue-dim:    rgba(79, 140, 255, 0.14);
  --green:       var(--color-primary, #00D09C);
  --green-dim:   rgba(0, 208, 156, 0.14);
  --amber:       var(--color-warning, #F59E0B);
  --amber-dim:   rgba(245, 158, 11, 0.14);
  --rose:        var(--color-danger, #EB5B3C);
  --rose-dim:    rgba(235, 91, 60, 0.14);
  --violet:      var(--color-violet, #A78BFA);
  --violet-dim:  rgba(167, 139, 250, 0.14);
  --teal:        var(--color-primary, #00D09C);
  --teal-dim:    rgba(0, 208, 156, 0.14);

  /* Text */
  --t1: var(--color-text-primary, #F5F5F5);
  --t2: var(--color-text-secondary, #8E8E93);
  --t3: var(--color-text-muted, rgba(255, 255, 255, 0.45));

  /* Borders */
  --border:      var(--color-border, rgba(255, 255, 255, 0.06));
  --border-md:   rgba(255, 255, 255, 0.11);

  /* Type */
  --font: var(--font-family, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif);

  /* Radius */
  --r-sm: var(--radius-small, 8px);
  --r-md: var(--radius-medium, 10px);
  --r-lg: var(--radius-large, 12px);
  --r-xl: var(--radius-xl, 16px);

  /* Layout */
  --tab-h:    68px;
  --hdr-h:    56px;
}''', css, count=1)

# 2. Touch targets
css = re.sub(r'(\.hdr-icon-btn\s*\{[^}]*)width:\s*\d+px;\s*height:\s*\d+px;', r'\1width: 44px; height: 44px;', css)
css = re.sub(r'(\.icon-btn\s*\{[^}]*)width:\s*\d+px;\s*height:\s*\d+px;', r'\1width: 44px; height: 44px;', css)
css = re.sub(r'(\.sheet__close\s*\{[^}]*)width:\s*\d+px;\s*height:\s*\d+px;', r'\1width: 44px; height: 44px;', css)

# 3. Remove Glow Orbs
css = re.sub(r'/\* Glow orbs \*/[\s\S]*?pointer-events: none;\s*\}\s*', '', css)

# 4. Remove gradients from avatars/buttons
css = re.sub(r'background:\s*linear-gradient\([^)]+\);', 'background: var(--blue);', css)

# 5. Remove blur effects
css = re.sub(r'backdrop-filter:[^;]+;', '', css)
css = re.sub(r'-webkit-backdrop-filter:[^;]+;', '', css)

# 6. Tab bar tweaks (solid color)
css = re.sub(r'background:\s*rgba\(17, 20, 26, 0.88\);', 'background: var(--surface-1);', css)

# 7. Button overrides
css = re.sub(r'(\.btn-primary\s*\{[^}]*)background:\s*var\(--blue\);([^}]*)\}', r'\1background: var(--green); border: none;\2}', css)
css = re.sub(r'(\.btn-primary\s*\{[^}]*)border:\s*1px solid[^;]+;', r'\1border: none;', css)

# 8. Modal backdrops
css = re.sub(r'(\.modal-backdrop\s*\{[^}]*)background:\s*rgba\(0,0,0,0\.55\);', r'\1background: rgba(13, 13, 15, 0.8);', css)
css = re.sub(r'(\.tab-bar\s*\{[^}]*)border-top:\s*1px solid var\(--border\);', r'\1border-top: 1px solid var(--border);', css)

# 9. Remove shadow from kpi card and other elements
css = re.sub(r'box-shadow:[^;]+;', '', css)

# 10. Appending new Net Worth CSS
new_css = '''

/* ── Net Worth Dashboard ────────────────────────────────── */
.nw-hero {
  text-align: center;
  padding: 32px 16px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.nw-hero__label {
  font-size: 13px;
  color: var(--t2);
  margin-bottom: 8px;
  font-weight: 500;
}
.nw-hero__value {
  font-size: 36px;
  font-weight: 700;
  color: var(--t1);
  font-variant-numeric: tabular-nums;
  margin-bottom: 12px;
  letter-spacing: -0.04em;
}
.nw-hero__meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.nw-hero__pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--r-sm);
}
.nw-hero__pill--up {
  background: var(--green-dim);
  color: var(--green);
}
.nw-hero__pill--down {
  background: var(--rose-dim);
  color: var(--rose);
}

.nw-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 16px;
  margin-bottom: 24px;
}
.nw-split__card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.nw-split__card--assets {
  border-color: rgba(0, 208, 156, 0.15);
}
.nw-split__card--liabilities {
  border-color: rgba(235, 91, 60, 0.15);
}
.nw-split__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.nw-split__card--assets .nw-split__icon {
  background: var(--green-dim);
  color: var(--green);
}
.nw-split__card--liabilities .nw-split__icon {
  background: var(--rose-dim);
  color: var(--rose);
}
.nw-split__info {
  flex: 1;
}
.nw-split__label {
  font-size: 12px;
  color: var(--t2);
  margin-bottom: 4px;
  font-weight: 500;
}
.nw-split__value {
  font-size: 16px;
  font-weight: 700;
  color: var(--t1);
  font-variant-numeric: tabular-nums;
}

.nw-module-list {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nw-module-row {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 14px 16px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.2s;
}
.nw-module-row:active {
  background: var(--surface-3);
}
.nw-module-row--coming {
  opacity: 0.6;
  cursor: default;
}
.nw-module-row--coming:active {
  background: var(--surface-2);
}
.nw-module-row__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--surface-3);
  color: var(--blue);
  flex-shrink: 0;
}
.nw-module-row__info {
  flex: 1;
}
.nw-module-row__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 2px;
}
.nw-module-row__sub {
  font-size: 12px;
  color: var(--t2);
}
.nw-module-row__value {
  font-size: 15px;
  font-weight: 600;
  color: var(--t1);
  font-variant-numeric: tabular-nums;
}
.nw-module-row__arrow {
  color: var(--t3);
  font-size: 16px;
  margin-left: 8px;
}

.coming-soon-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background: var(--surface-3);
  color: var(--t2);
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
'''
css += new_css

with open('d:/Python Projects/Moneta - Copy/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)

# Generate new tokens.css
tokens_css = '''/* Moneta Design Tokens (Groww/INDmoney inspired) */

:root {
  /* COLORS */
  --color-background: #0D0D0F;
  --color-surface: #1A1A1F;
  --color-card: #1A1A1F;
  --color-elevated: #222228;
  --color-border: rgba(255, 255, 255, 0.06);
  --color-primary: #00D09C;
  --color-success: #00D09C;
  --color-warning: #F59E0B;
  --color-danger: #EB5B3C;
  --color-info: #4F8CFF;
  --color-violet: #A78BFA;
  
  /* TEXT */
  --color-text-primary: #F5F5F5;
  --color-text-secondary: #8E8E93;
  --color-text-muted: rgba(255, 255, 255, 0.45);
  --color-text-inverse: #0D0D0F;
  
  /* ELEVATION */
  --surface-0: #0D0D0F;
  --surface-1: #1A1A1F;
  --surface-2: #1A1A1F;
  --surface-3: #222228;
  
  /* OPACITY */
  --opacity-disabled: 0.40;
  --opacity-hover: 0.08;
  --opacity-overlay: 0.60;
  
  /* BLUR */
  --blur-sheet: 0px;
  --blur-dialog: 0px;
  
  /* SPACING (8px grid) */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 40px;
  --space-6: 48px;
  --space-7: 64px;
  --space-8: 80px;
  
  /* BORDER RADIUS */
  --radius-small: 8px;
  --radius-medium: 10px;
  --radius-large: 12px;
  --radius-xl: 16px;
  
  /* SHADOWS (Minimal/Flat) */
  --shadow-small: none;
  --shadow-medium: none;
  --shadow-large: none;
  
  /* TYPOGRAPHY */
  --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
  --font-size-display: 32px;
  --font-size-heading: 24px;
  --font-size-body: 14px;
  --font-size-caption: 12px;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* ANIMATION (Fast & Subtle) */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Z-INDEX */
  --z-sticky: 50;
  --z-dropdown: 60;
  --z-overlay: 100;
  --z-modal: 200;
}
'''
with open('d:/Python Projects/Moneta - Copy/css/tokens.css', 'w', encoding='utf-8') as f:
    f.write(tokens_css)
