# Login Design QA

## Visual Truth

- Selected reference: `/var/folders/n_/tmw503rs3t906tl62b_6f19w0000gn/T/codex-clipboard-91509873-6a0b-462a-82ed-996dea859874.png`
- Latest user direction: center the login panel, use 20% glass transparency, keep the fission artwork full-screen and interactive beneath the form, remove the logo and subtitle, use icon-only theme controls at bottom-left, and show `ver 1.02`.
- Implementation capture: `design-qa-assets/login-desktop.png`
- Full comparison: `design-qa-assets/login-comparison.png`
- Form-region comparison: `design-qa-assets/login-form-comparison.png`
- Light-theme final capture: `design-qa-assets/login-light-final.png`
- Dark-theme final capture: `design-qa-assets/login-dark-final.png`
- Ultra-wide dark capture: `design-qa-assets/login-wide-fullscreen-final.png`
- Ultra-wide light capture: `design-qa-assets/login-wide-light-fullscreen-final.png`
- Dark seed-inside capture: `design-qa-assets/login-seed-inside-dark.png`
- Light seed-inside capture: `design-qa-assets/login-seed-inside-light.png`
- Cursor-alignment capture: `design-qa-assets/login-cursor-alignment-dark.png`
- Captured viewport: 390 x 844 pixels.
- State: dark theme, empty login form, interactive spotlight at its resting position.

## Findings

- The abstract seed-network/fission artwork fills the complete viewport and remains the dominant visual.
- The form is centered and uses a 20% alpha background with blur and saturation, preserving background visibility through the panel.
- Pointer tracking is registered on `window`, so the reveal continues to respond while the pointer is over form fields and buttons.
- The removed logo and subtitle are intentional user-requested deviations from the original selected reference.
- Theme selection is reduced to two icon buttons in the lower-left corner; `ver 1.02` is visible in the lower-right corner.
- Light theme uses the same 20% glass treatment with brighter artwork and strengthened label/action contrast.
- Light theme now has its own white, light-gray base artwork and matching charcoal reveal artwork instead of filtering the dark asset.
- The seed core is positioned just inside the glass panel's upper-left corner, with the fission branches extending beyond the panel into the full viewport.
- The seed body is fully contained by the panel with an asymmetric upper-left placement; it is intentionally not centered in the form.
- At 2048 x 1050, the artwork bounds extend beyond every viewport edge, horizontal overflow is absent, and no solid-color strip is exposed.
- Responsive rules constrain the panel to `calc(100vw - 32px)` below 760 pixels and preserve safe-area spacing for fixed controls.
- Browser viewport emulation reported desktop layout metrics correctly but continued emitting a 390 x 844 capture; responsive sizing was therefore also checked directly against the CSS constraints.

## Interaction Checks

- Empty submit displays the required account/password validation message.
- Password visibility control toggles without submitting the form.
- Successful demo submission enters the existing application without altering its operational flows.
- Light and dark theme controls update the login presentation.
- Pointer movement over the account input updates the artwork spotlight position.
- At 2048 x 1050, measured spotlight deltas were `0px, 0px` at both left-side cursor position `(140, 520)` and right-side position `(1900, 520)`.
- No horizontal overflow was observed in the captured 390-pixel-wide output.

## Comparison History

1. Removed the initial white logo tile after visual review; the user then explicitly requested that the logo be omitted entirely.
2. Increased light-theme label and forgot-password contrast after the first light-mode capture.
3. Moved the glass panel from the left rail to the screen center and exposed the full background interaction across the login workflow.

## Final Result

final result: passed
