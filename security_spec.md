# Security Specification - California Road Trip

## Data Invariants
1. A user can only update their own location and profile.
2. Any user in the "Family" (all authenticated users for this simple road trip app) can read all locations.
3. Alerts are read-only for standard users; system or admin (initially same as user for demo) can create them.

## The Dirty Dozen Payloads
- P1: Attempt to update another user's location. (Deny)
- P2: Attempt to create a user with a spoofed UID. (Deny)
- P3: Attempt to delete the `alerts` collection. (Deny)
- P4: Attempt to inject a 1MB string into `displayName`. (Deny)
- P5: Attempt to update `createdAt` on an alert. (Deny)
- P6: Attempt to read `users` without authentication. (Deny)
- P7: Attempt to update `settings` of another family member. (Deny)
- P8: Attempt to set `alertsEnabled` to a non-boolean value. (Deny)
- P9: Attempt to write to `users` with missing `uid`. (Deny)
- P10: Attempt to spoof `updatedAt` with a future timestamp. (Deny)
- P11: Attempt to list all users without being logged in. (Deny)
- P12: Attempt to create an alert with an invalid type. (Deny)

## Test Runner
(Tests will be verified against rules)
