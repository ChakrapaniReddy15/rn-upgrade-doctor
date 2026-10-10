Pure checks: each takes a `ProjectContext` and returns `Finding[]`. `runChecks` runs them all and ranks the findings
(blocker > warning > info, then check order). Thresholds and advice come from `src/rules/`.
