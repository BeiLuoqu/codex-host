# Spec Delta

## ADDED Requirements

### Requirement: Optional history reads do not open execution Sessions

HarnessAdapter MAY expose the optional `readHistory` operation for a bound Native Session Ref. It SHALL return the existing public history snapshot shape without opening an execution Session or sending input. Native identity and scope validation SHALL remain Adapter-owned; unsupported Adapters SHALL retain their existing snapshot behavior.

#### Scenario: A viewer reads stored history
- **WHEN** an Adapter supporting readHistory receives a valid Native Session Ref
- **THEN** it SHALL read that native history without creating, resuming or steering an execution Session

#### Scenario: A reference belongs to another native scope
- **WHEN** the Native Session Ref is outside the configured scope
- **THEN** the Adapter SHALL reject the read without opening a replacement Session
