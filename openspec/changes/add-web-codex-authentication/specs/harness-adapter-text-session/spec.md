# Spec Delta

## ADDED Requirements

### Requirement: Optional native steering preserves the active Turn

HarnessSession MAY expose the optional `steer` operation for native same-turn input using public Host Turn identity and text input. An implementation SHALL retain native acceptance and rejection semantics. Consumers MUST NOT turn a failed native steer into automatic cancellation and replay. Sessions without this operation SHALL retain their existing steering behavior.

#### Scenario: Native steering accepts input
- **WHEN** an active Session accepts an explicit native steer
- **THEN** the input SHALL remain in the existing native Turn without creating a second Turn

#### Scenario: Native steering rejects input
- **WHEN** the native operation fails or its result is unknown
- **THEN** the caller SHALL receive a normalized failure
- **AND** Host MUST NOT automatically cancel the Turn and resend the input
