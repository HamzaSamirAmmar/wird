-- Adds the `superadmin` enum value ahead of the role-scoping migration that follows.
-- Kept in its own transaction: Postgres will not let a new enum value be referenced
-- (in a policy, function body, or data migration) within the same transaction that adds it.

alter type public.user_role add value 'superadmin';
