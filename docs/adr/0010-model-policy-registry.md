# Centralize model selection behind a Model Policy Registry

Concrete provider and model identifiers currently leak into extension logic, deployment settings, agent definitions, and tests. We will make a versioned Model Manifest the single source of truth and expose a Model Policy Registry that maps Model Roles to reusable policies and ordered Candidate Slots; Pi continues to own provider registration and credentials, while a constrained untracked local overlay may replace only non-security, non-vision candidate bindings. Security Model Roles keep repository-approved candidates and fail closed, and the primary policy controls only Pi's initial default because host recovery remains a visible platform constraint rather than an enforceable fallback chain.

## Considered Options

- **Keep model selection in each feature**: rejected because every provider migration would require scattered, difficult-to-audit edits.
- **Manage providers and credentials in the Manifest**: rejected because Pi already owns authentication, Provider Registry and model metadata.
- **Allow local vision candidate overrides**: rejected because deployment cannot independently verify a replacement model's image capability before assigning it to `image-reader`.

## Consequences

- Extension model calls and deployment compilation must cross the Model Policy Registry seam; direct Provider registration is prohibited.
- Local overrides may replace only model, Model Label and thinking for ordinary non-vision policies. Security and vision candidates remain repository-approved.
- A deployed subagent role may use fallback candidates only when they share its primary candidate's thinking level, because Pi settings represent fallback models as strings.
- Role adapters explicitly enforce their declared failure semantics: skip for titles, confirm for Judge/self-test, and error-no-write for security audit.
- `/models-doctor` diagnoses Pi's recovered primary model rather than attempting to override Pi's native recovery behavior.
