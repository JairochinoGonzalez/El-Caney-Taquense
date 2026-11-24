# Security Specification — El Caney Taquense

## 1. Data Invariants
- Bootstrapped Admin (`yohelly.bracho@gmail.com`, verified email) and active `admin` accounts in `staffUsers` are the only users allowed to create/modify/delete `staffUsers`, `payroll`, `appConfig`, delete `products`, delete `sales`, or edit locked product costs/prices.
- A `taquilla` user can ONLY create/suspend `sales` with `kind == 'taquilla'`, can read/create/restock `products`, can read/create/update `events`, and can create/read `closedShifts`. They CANNOT read/write `payroll` or `appConfig` writes, and CANNOT create `sales` with `kind == 'barra'` or `courtesies`.
- A `caja` user can ONLY create/suspend `sales` with `kind == 'barra'` and `courtesies`, can read/create/restock `products`, can read/create/update `events`, and can create/read `closedShifts`. They CANNOT read/write `payroll` or `appConfig` writes, and CANNOT create `sales` with `kind == 'taquilla'`.
- PII (`staffUsers` emails) can only be read by `isAdmin()` or by the matching verified user (`resource.data.email == request.auth.token.email.lower()`).
- List queries NEVER use `get()` or `exists()`; they verify membership directly via `resource.data.staffEmails` / `resource.data.adminEmails` / `resource.data.email`.
- Client timestamps (`createdAt`, `updatedAt`) MUST equal `request.time`.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated read on `products` -> PERMISSION_DENIED
2. Unverified email (`email_verified: false`) pretending to be `yohelly.bracho@gmail.com` -> PERMISSION_DENIED
3. Non-admin (`taquilla`) attempting to list all `staffUsers` (PII scraping) -> PERMISSION_DENIED
4. Non-admin (`caja`) attempting to create/promote themselves in `staffUsers` with `role: 'admin'` -> PERMISSION_DENIED
5. `taquilla` user attempting to create a `barra` sale -> PERMISSION_DENIED
6. `caja` user attempting to create a `taquilla` sale -> PERMISSION_DENIED
7. `caja` user attempting to delete an active `sale` -> PERMISSION_DENIED
8. `taquilla` user attempting to read `payroll` -> PERMISSION_DENIED
9. Employee attempting to modify `appConfig/main.exchangeBufferBs` -> PERMISSION_DENIED
10. Employee attempting to inject a shadow field (`isAdmin: true`) into `products` -> PERMISSION_DENIED
11. Employee attempting to overwrite immutable `createdAt` or spoof `createdAt != request.time` -> PERMISSION_DENIED
12. Over-sized ID (> 128 chars or invalid characters) on `events/{eventId}` -> PERMISSION_DENIED
