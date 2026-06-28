# Component Extraction & Implementation Workflow

Detailed procedure for extracting reusable components from a `.pen` file and implementing them in code with pixel-perfect fidelity.

## Step 1: Discover All Reusable Components

```
get_editor_state(include_schema=false)
```

From the response, collect all nodes with `reusable: true`. These are the design system components.

Example output:
```
Reusable Components:
- OjdTt: Component/Button/Primary
- 5jucT: Component/Button/Outline
- HHdX9: Component/Avatar/Agent
- 3X9H4: Component/Input
- XjPhS: Component/TopBar
- Rzvbh: Component/TabBar
```

## Step 2: Determine Implementation Order

Implement in dependency order — components used by other components go first:

1. **Leaf components** (no children that are refs): Avatar, Input, Button
2. **Composite components** (contain refs or are used as containers): TopBar, TabBar
3. **Layout components** (contain slots for child content): Sidebar, Card

## Step 3: Extract Single Component

For each component, run:

```
batch_get(filePath, nodeIds=["componentId"], readDepth=10, includePathGeometry=true)
```

Record every property from the response:

### Layout Properties
| Property | Maps to CSS/Tailwind |
|----------|---------------------|
| `layout: "vertical"` | `flex-direction: column` / `flex-col` |
| `layout: "horizontal"` | `flex-direction: row` / `flex-row` |
| `layout: "none"` | `position: relative` (children use absolute positioning) |
| `alignItems` | `align-items` / `items-*` |
| `justifyContent` | `justify-content` / `justify-*` |
| `gap` | `gap` / `gap-*` |

### Sizing Properties
| Property | Maps to CSS/Tailwind |
|----------|---------------------|
| `width: number` | Fixed width in px |
| `width: "fill_container"` | `width: 100%` / `flex: 1` / `w-full` |
| `width: "fit_content"` | `width: fit-content` / `w-fit` |
| `width: "fill_container(N)"` | `flex: 1; min-width: Npx` |
| `height: "fit_content(N)"` | `height: auto; min-height: Npx` |

### Spacing Properties
| Property | Maps to CSS/Tailwind |
|----------|---------------------|
| `padding: N` | Uniform padding Npx |
| `padding: [top, right, bottom, left]` | Per-side padding |
| `padding: [vertical, horizontal]` | Shorthand padding |

### Visual Properties
| Property | Maps to CSS/Tailwind |
|----------|---------------------|
| `fill: "$variable"` | `background-color: var(--variable)` |
| `fill: "#hex"` | `background-color: #hex` (prefer tokens) |
| `fill: { type: "gradient", ... }` | CSS gradient |
| `fill: { type: "image", url: "..." }` | `background-image` or `<img>` |
| `cornerRadius: N` | `border-radius: Npx` |
| `cornerRadius: [tl, tr, br, bl]` | Per-corner radius |
| `stroke: { fill, thickness }` | `border: Npx solid color` |
| `stroke: { thickness: { bottom: 1 } }` | `border-bottom: 1px solid color` |
| `effect: { type: "shadow", ... }` | `box-shadow` |

### Text Properties
| Property | Maps to CSS/Tailwind |
|----------|---------------------|
| `fontFamily` | `font-family` |
| `fontSize` | `font-size` |
| `fontWeight` | `font-weight` |
| `fill` (on text) | `color` |
| `textAlign` | `text-align` |
| `lineHeight` | `line-height` |
| `letterSpacing` | `letter-spacing` |
| `textGrowth: "fixed-width"` | Text does not auto-size; uses parent width |

### Icon Properties
| Property | Maps to |
|----------|---------|
| `type: "icon_font"` | Icon component |
| `iconFontFamily: "lucide"` | `lucide-react` package |
| `iconFontFamily: "Material Symbols Rounded"` | `@material-symbols` package |
| `iconFontName` | Specific icon name |
| `width`, `height` | Icon size |
| `fill` | Icon color |

## Step 4: Create React Component

Structure template:

```tsx
interface ComponentNameProps {
  // Props derived from instance overrides (descendants)
  label?: string;
  iconName?: string;
  variant?: 'default' | 'active';
  className?: string;
}

export function ComponentName({ label = "Default", ...props }: ComponentNameProps) {
  return (
    // Match EXACT structure from batch_get response
    // Use design tokens for all colors
    // Match exact spacing values
  );
}
```

### Props Derivation Rules

1. Scan ALL instances of this component across all pages
2. For each `descendants` override in instances, create a prop
3. If an override appears in ALL instances → required prop
4. If an override appears in SOME instances → optional prop with default from base component

### Children Rendering Rules

For each child in the component:
- `type: "text"` → render as text element, expose `content` as prop
- `type: "icon_font"` → render as icon, expose `iconFontName` as prop
- `type: "frame"` → render as div/container with matching layout
- `type: "ref"` → render as nested component instance
- `type: "rectangle"` → render as div with matching visual properties

## Step 5: SVG and Path Handling

When a component contains `type: "path"` nodes:

1. Run `batch_get` with `includePathGeometry: true`
2. Extract the exact `geometry` string
3. Use it as the `d` attribute in an SVG `<path>` element
4. Set `viewBox="0 0 {width} {height}"` from the node's dimensions
5. **NEVER** approximate or simplify path geometry

## Step 6: Component Screenshot Validation

After implementing each component:

1. Capture design baseline: `get_screenshot(filePath, nodeId=componentId)`
2. Render the component in the browser in isolation
3. Capture browser screenshot of the rendered component
4. Compare visually — check:
   - Overall shape and proportions match
   - Colors are identical
   - Typography (font, size, weight) matches
   - Spacing (padding, gap) matches
   - Border/stroke matches
   - Shadow/effects match
   - Icon renders correctly

If ANY discrepancy is found:
1. Identify the specific property that differs
2. Re-read the design node to get the exact value
3. Fix the implementation
4. Re-validate

**Do NOT proceed to the next component until validation passes.**
