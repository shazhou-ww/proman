# @shazhou/proman

## 0.6.4

### fix

- Move CHANGELOG generation and changeset file deletion from publish to bump
- chmod +x bin entries after build — prevents `Permission denied` after tsc rebuild
- Skip private packages during publish (#61, #62)
- Skip already-published packages instead of aborting (#66, #67)

### refactor

- Simplify publish loop, eliminate indexOf reference dependency (#64)

### chore

- Add pre-push hook for lint + test (#63)
