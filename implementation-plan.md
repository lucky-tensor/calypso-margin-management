# Implementation Plan: Issue #56 — Order Entry UX Polish

## Tasks

- [x] Linft bundle cards show total delivered length alongside overage
- [x] Fix linft overage calculation (overage already in linft, no conversion needed)
- [x] Pill badges section shows brief explanatory line when at least one pill is visible
- [x] "Sqft" toggle label reads "Sq ft"
- [x] Sell price label reads "Sell price per roll ($)"
- [x] Update existing tests for new label text
- [x] Update pill badge tests to use exact matching (avoid matching explanatory text)
- [x] Add component test: linft bundle card with overage — verify "X ft delivered — Y ft overage"
- [x] Add component test: 2+ bundles shown — verify explanatory text appears below pill row
