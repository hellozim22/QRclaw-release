# Visual Validation Checklist & Techniques

Comprehensive verification process to ensure pixel-perfect fidelity between Pencil design and code implementation.

## Validation Process

### Step 1: Capture Baselines

For each component or page being validated:

```
# Design baseline
get_screenshot(filePath, nodeId="targetNodeId")

# Implementation baseline
# Use browser MCP to navigate to the page and take screenshot
browser_navigate(url="http://localhost:3000/target-page")
browser_take_screenshot()
```

### Step 2: Side-by-Side Comparison

Systematically compare every visual property:

## Component-Level Checklist

### Dimensions
- [ ] Width matches design (±0px for fixed, proportional for flexible)
- [ ] Height matches design
- [ ] Min/max constraints honored

### Layout
- [ ] Flex direction matches (row vs column)
- [ ] Alignment matches (start, center, end, space-between)
- [ ] Gap between children matches exactly
- [ ] Children order matches design

### Spacing
- [ ] Padding top matches
- [ ] Padding right matches
- [ ] Padding bottom matches
- [ ] Padding left matches
- [ ] External margins match (if applicable)

### Typography
- [ ] Font family matches (exact family name from design tokens)
- [ ] Font size matches (exact px value)
- [ ] Font weight matches (exact weight number: 400, 500, 600, 700)
- [ ] Line height matches
- [ ] Letter spacing matches
- [ ] Text color matches (use design token variable)
- [ ] Text alignment matches (left, center, right)
- [ ] Text content matches exactly (no typos, no missing text)

### Colors
- [ ] Background color/fill matches (use design token)
- [ ] Text color matches
- [ ] Border/stroke color matches
- [ ] Icon color matches
- [ ] All colors use design token variables, NOT hardcoded hex

### Borders & Corners
- [ ] Border width matches on all sides
- [ ] Border color matches
- [ ] Border style (only specific sides if designed that way)
- [ ] Corner radius matches (all corners or specific corners)

### Effects
- [ ] Box shadow offset-x matches
- [ ] Box shadow offset-y matches
- [ ] Box shadow blur matches
- [ ] Box shadow color matches
- [ ] Shadow type (outer/inner) matches

### Icons
- [ ] Icon family matches (lucide, Material Symbols, etc.)
- [ ] Icon name matches exactly
- [ ] Icon size matches (width × height)
- [ ] Icon color matches

### Images
- [ ] Image source is correct
- [ ] Image sizing mode matches (cover, contain, fill)
- [ ] Image corner radius matches container

## Page-Level Checklist

### Structure
- [ ] All component instances are present (count matches design)
- [ ] Component order matches design
- [ ] No missing elements
- [ ] No extra/duplicate elements

### Component Instances
- [ ] Each instance has correct prop overrides (from `descendants`)
- [ ] Instance-level size overrides applied
- [ ] Nested component overrides applied correctly

### Responsive Behavior
- [ ] Fill-container elements expand to available space
- [ ] Fit-content elements size to their content
- [ ] Scrollable areas scroll correctly
- [ ] No unexpected overflow
- [ ] No content clipping (unless `clip: true` in design)

### Navigation
- [ ] All links/buttons navigate to correct pages
- [ ] Back buttons work correctly
- [ ] Tab bars highlight correct active tab
- [ ] Route structure matches flow diagram

### Content
- [ ] All text strings match design exactly
- [ ] All placeholder text matches
- [ ] All labels match
- [ ] All button text matches

## Common Discrepancies and Fixes

### Color Mismatch
**Symptom**: Color appears different in browser
**Check**: Inspect computed CSS color vs design hex value
**Fix**: Ensure the design token variable resolves to exact hex from `get_variables`

### Spacing Off by a Few Pixels
**Symptom**: Elements slightly misaligned
**Check**: Inspect padding/margin/gap in browser dev tools
**Fix**: Re-read the design node, extract exact values, apply without rounding

### Font Rendering Difference
**Symptom**: Text looks slightly different weight or size
**Check**: Verify exact font family is loaded (not falling back to system font)
**Fix**: Ensure font is imported/loaded. Match exact weight (don't use "bold", use "700")

### Icon Not Matching
**Symptom**: Different icon or missing icon
**Check**: Verify `iconFontFamily` and `iconFontName` from design data
**Fix**: Install correct icon package, use exact icon name

### Border Only on Specific Side
**Symptom**: Full border instead of bottom-only border
**Check**: Design has `stroke: { thickness: { bottom: 1 } }` (not all sides)
**Fix**: Use `border-bottom` instead of `border`

### Gradient Not Matching
**Symptom**: Background gradient direction or colors differ
**Check**: Design gradient `rotation`, `colors`, and `positions`
**Fix**: Map rotation to CSS degree. Pencil rotation=180 → `to bottom`. Apply each color stop at exact position.

### Overflow Clipping
**Symptom**: Content overflows container
**Check**: Design has `clip: true` on the frame
**Fix**: Add `overflow: hidden` to the container

### Shadow Rendering
**Symptom**: Shadow too strong/weak or wrong direction
**Check**: Design shadow `blur`, `color` (note alpha), `offset`
**Fix**: Match exact values. Pay attention to color alpha (e.g., `#00000008` is very subtle)

## Automated Validation Techniques

### Using Browser MCP for Comparison

```
# Navigate to page at design dimensions
browser_resize(width=390, height=844)  // Mobile
browser_navigate(url="http://localhost:3000/login")
browser_take_screenshot(filename="impl-login.png")
```

Then visually compare with the design screenshot from `get_screenshot`.

### Layout Inspection

Use `snapshot_layout(filePath, parentId, maxDepth=3)` to get computed layout rectangles from the design, then compare with browser-computed values:

```
# Get design layout
snapshot_layout(filePath, parentId="pageId", maxDepth=3)

# Get browser layout
browser_evaluate(function="() => { ... inspect elements ... }")
```

### Pixel-Level Verification Priority

When time is limited, prioritize checking in this order:

1. **Layout structure** — correct elements in correct positions
2. **Typography** — font family, size, weight, color
3. **Colors** — backgrounds, borders, text colors
4. **Spacing** — padding, gap, margins
5. **Visual details** — shadows, radius, gradients, icons
6. **Interactive states** — hover, active, disabled appearances
