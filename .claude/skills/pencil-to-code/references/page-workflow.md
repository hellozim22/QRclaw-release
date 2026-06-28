# Page Assembly & Composition Workflow

Detailed procedure for building complete pages from Pencil designs, composing reusable components with page-specific content.

## Step 1: Read the Full Page Structure

```
batch_get(filePath, nodeIds=["pageId"], readDepth=10)
get_screenshot(filePath, nodeId="pageId")
```

Capture the full node tree and visual baseline before writing any code.

## Step 2: Analyze the Page Tree

Walk through the node tree and classify each child:

| Node Pattern | Implementation |
|-------------|----------------|
| `type: "ref", ref: "componentId"` | Instance of reusable component → use the React component with props |
| `type: "ref"` + `descendants: {...}` | Component instance with overrides → pass overrides as props |
| `type: "frame"` (non-reusable) | Page-specific container → implement as div/section |
| `type: "text"` | Static text → implement as text element with exact styles |
| `type: "icon_font"` | Icon → implement with matching icon package |
| `type: "rectangle"` | Decorative/layout element → implement as styled div |
| `type: "frame"` + `height/width: N` + `name: "sp*"` | Spacer → implement as spacing (margin/gap or empty div) |

## Step 3: Map Component Instances

For every `ref` node found in the page:

1. Identify which reusable component it references (`ref` field → component ID)
2. Extract all `descendants` overrides — these become component props
3. Extract instance-level overrides (width, height different from base component)

**Example:**
```json
{
  "id": "535nB",
  "type": "ref",
  "ref": "XjPhS",           // References Component/TopBar
  "descendants": {
    "TACyl": { "content": "Café Assistant" }  // Override title text
  },
  "width": 390,
  "height": 50
}
```

Translates to:
```tsx
<TopBar title="Café Assistant" />
```

## Step 4: Handle Layout Patterns

### Vertical Stack (most common for mobile pages)
```json
{ "layout": "vertical", "clip": true, "fill": "$white", "height": 844, "width": 390 }
```
→ `flex flex-col overflow-hidden bg-white h-[844px] w-[390px]`

### Horizontal Split (common for web dashboards)
```json
{ "layout": "horizontal" } with children having width: 80, width: 320, width: "fill_container"
```
→ `flex flex-row` with `w-20`, `w-80`, `flex-1`

### Absolute Positioning
```json
{ "layout": "none" } with children having x, y coordinates
```
→ `position: relative` container, children use `position: absolute; left: Xpx; top: Ypx`

### Fill Container with Minimum
```json
{ "height": "fill_container" }        → flex: 1
{ "height": "fit_content(900)" }      → height: auto; min-height: 900px
{ "width": "fill_container(1120)" }   → flex: 1; min-width: 1120px
```

## Step 5: Handle Spacer Nodes

Pencil designs often use empty frame nodes as spacers (named `sp*`, `sp01`, etc.):

```json
{ "id": "Fdqjd", "name": "sp01", "type": "frame", "height": 16, "width": 1 }
```

Implementation options (choose based on context):
1. **CSS gap** on parent — if spacers are uniform, use parent's `gap` property instead
2. **Margin/padding** on adjacent elements
3. **Spacer div** — `<div className="h-4" />` (last resort for variable spacing)

Prefer using the parent's `gap` or child `margin` over explicit spacer divs.

## Step 6: Implement Page-Specific Elements

For non-reusable frames (inline content):

1. Read all properties from the node data
2. Create styled elements matching:
   - Layout direction, alignment, gap
   - Exact padding values
   - Background fill / gradient
   - Border/stroke configuration
   - Shadow/effects
3. Recursively implement children

### Gradient Backgrounds
```json
{
  "fill": {
    "type": "gradient",
    "gradientType": "linear",
    "rotation": 180,
    "colors": [
      { "color": "#FFFFFF", "position": 0 },
      { "color": "#FEF2F2", "position": 1 }
    ]
  }
}
```
→ `background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%)`

### Stroke as Border
```json
{ "stroke": { "fill": "$gray-border", "thickness": { "bottom": 1 } } }
```
→ `border-bottom: 1px solid var(--gray-border)`

### Shadow Effects
```json
{ "effect": { "type": "shadow", "shadowType": "outer", "blur": 12, "color": "#00000008", "offset": { "x": 0, "y": 4 } } }
```
→ `box-shadow: 0px 4px 12px #00000008`

## Step 7: Build Page Routes

Use flow diagram nodes (`FlowDiagram/*`) and annotation nodes to determine:

1. **Route paths**: Derive from page names (e.g., `Mobile/Login` → `/login`)
2. **Navigation links**: Which button/element navigates where
3. **Conditional routing**: Auth guards, role-based access

### Common Route Mapping
| Page Name Pattern | Route |
|-------------------|-------|
| `Mobile/Login` | `/login` |
| `Mobile/SignUp` | `/signup` |
| `Mobile/Chat` | `/chat/:agentId` |
| `Mobile/Messages` | `/messages` |
| `Mobile/Me` | `/me` |
| `Web/LandingPage` | `/` |
| `Web/Dashboard-*` | `/dashboard/*` |
| `Web/Settings` | `/settings` |

## Step 8: Implement Annotations as Behavior

Annotation nodes contain interaction specs as text content. Parse them for:

1. **State machines**: "3 pre-built templates + Custom blank" → template selection state
2. **Form validations**: "Name * (required, 40 char limit)" → validation rules
3. **Real-time features**: "WebSocket → SSE fallback → HTTP Poll" → connection strategy
4. **Error states**: "30s no chunk → 'Reply interrupted' + Retry" → error handling
5. **Streaming behavior**: "Red blinking cursor at insertion point" → streaming UI

## Step 9: Page Screenshot Validation

After implementing each page:

1. Run the page in browser at the exact design dimensions
   - Mobile pages: 390 × 844
   - Web pages: 1440 × 900 (or as specified)
2. Take browser screenshot
3. Compare with `get_screenshot` baseline
4. Check every element against the design:
   - Component instances render correctly with overrides
   - Spacing between elements matches
   - Colors and backgrounds match
   - Text content matches (no typos or missing text)
   - Icons render correctly
   - Scroll/overflow behavior is correct

## Mobile vs Web Page Strategy

### Mobile Pages (390 × 844)
- Fixed viewport width, scrollable height
- Bottom tab bar is typically fixed
- Top bar is typically fixed
- Content area scrolls between top bar and tab bar
- Use `overflow-y: auto` on content area

### Web Pages (1440 × 900)
- Three-column layout common (sidebar 80px + middle + content)
- Sidebar navigation is fixed
- Content area may scroll independently
- Responsive considerations for smaller viewports

## Batch Processing Pages

When implementing multiple pages, group by shared layout:

1. **Mobile auth flow** (Login, SignUp, Verify): Share layout wrapper
2. **Mobile chat flow** (Chat, Chat-Streaming, LongPressCopy): Share chat layout
3. **Mobile list flow** (Messages, SwipeDelete): Share list layout
4. **Web dashboard flow** (Dashboard-*): Share sidebar + column layout
5. **Web creation flow** (AddQR, CreateQR-*): Share modal/wizard layout
