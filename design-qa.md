# Design QA

## Scope

- System guide workflow, review rules, role ownership, and page directory.
- Desktop and responsive layout in light/dark-compatible design tokens.

## Visual Checks

- Workflow uses one continuous rail with icon nodes instead of numbered labels or isolated arrows.
- Cards have clear spacing, equal structure, concise descriptions, and an explicit outcome line.
- Review-rule copy wraps within a wider content column without colliding with role ownership.
- Role descriptions align with their headings; icons sit inline with role names.
- At narrower breakpoints the rail is removed and cards reflow without overlap or horizontal text clipping.

## Verification

- `npm run test`: passed
- `npm run build`: passed
- In-app browser DOM and desktop viewport inspection: passed
- No console-blocking or layout-breaking issue observed in the guide page.

final result: passed
