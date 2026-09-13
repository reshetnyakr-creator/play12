# Play12 MVP visual foundation

All new user-facing pages and onboarding screens under `play12.pro/MVP` inherit the visual language of the current `play12.pro` site by default.

Reuse the site's typography, colors, backgrounds, border radii, borders, spacing rhythm, logo assets, and button behavior before introducing any MVP-specific styling. Do not create new fonts, UI palettes, button systems, or branding without a separate product decision.

Functional music surfaces such as the Playfield, Piano View, and playback controls may keep their specialized visual treatment when readability or interaction requires it. Any deviation from the site foundation must be deliberate and local to that functional element.

The minimal reusable CSS foundation currently lives in `renderer/play12-onboarding.css`:

- `mvp-shell`
- `mvp-site-header` / `mvp-site-logo`
- `mvp-logo-link` / `mvp-site-nav` / `mvp-language-switch`
- `mvp-page` / `mvp-content`
- `mvp-heading` / `mvp-body-text`
- `mvp-actions`
- `mvp-button`, `mvp-button-primary`, `mvp-button-secondary`
- `mvp-card`
- `mvp-midi-connect` / `mvp-piano-host`

Shared `--play12-site-*` tokens mirror the corresponding values on the main site.
