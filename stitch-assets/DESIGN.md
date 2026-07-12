# Nexus Settlement Core

Source: Stitch project `4774504318234751299`, design system asset `af3306af5dbc49aca78da4fae744d116`.

## Foundations

- Personality: professional, reliable, efficient, data-driven.
- Primary: `#282c6f`; primary container: `#3f4487`; primary soft: `#e0e0ff`.
- Light canvas: `#eceef1`; light surface: `#ffffff`.
- Dark canvas: `#0d0c22`; dark surface: `#16162a`.
- Success: `#10b981`; warning: `#f59e0b`; danger: `#ef4444`; info: `#3b82f6`.
- Body and headings: Hanken Grotesk with Chinese system-font fallback.
- Numeric data and IDs: JetBrains Mono with monospace fallback.
- Base spacing unit: 4px; gutter: 16px; desktop margin: 24px; mobile margin: 16px.
- Standard radius: 8px; status chip radius: 4px; mobile touch target: 44px.

## Layout

- Desktop: fixed 240px side navigation, fixed 64px context bar, 12-column fluid content.
- Mobile: single-column task flow and bottom navigation; tables become task cards.
- Use tonal layers and low-contrast borders. Shadows are reserved for floating surfaces.
- Prioritize pending work, evidence, calculation formulas, audit trails and relationship paths.

## Components

- Tables use sticky headers and compact rows.
- Status badges pair color with readable text.
- Settlement views expose quantity, unit price, adjustment and total.
- Audit progress is horizontal on desktop and vertical on mobile.
- Relationship nodes visually distinguish the current broker, referrer and direct referrals.
