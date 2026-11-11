---
title: Manage Users usage guide
module: users
order: 9
anchors: [assign-roles, administrator-includes-all-roles]
---

## Overview

Manage Users lists everyone who can sign in. New sign-ups, including Google sign-ins, wait on the "Waiting for access" page until an administrator gives them a role. Roles decide which modules a person can open: Administrator, Front Desk, Line Department and Customer.

Only Administrators can open this page.

## Common tasks

### Assign roles {#assign-roles}

1. In the Role column, pick a role from the list for one-click changes, or open the row menu and choose **Edit** to tick several roles.
2. In the Edit User sheet, tick the roles the person should have under **Roles** and press **Save Changes**.

The app refuses to remove the last active Administrator, and you cannot remove your own Administrator role or deactivate your own account.

### Administrator includes all roles {#administrator-includes-all-roles}

An Administrator can open and manage every module, so ticking **Administrator** automatically gives them everything Front Desk and Line Department give. In the Edit User sheet those two roles then show as ticked and greyed out with "Included with Administrator", and the Users list shows just "Administrator" for that person.

- Customer is not included. It is for aircraft owners and has no module access, so an administrator who is also an aircraft owner can still tick Customer.
- Unticking Administrator brings back the normal choices. Front Desk and Line Department are not remembered from before, so tick them again if the person should keep them.

## Troubleshooting

- **"At least one active Administrator is required."** Make someone else an Administrator first, then change this person.
- **A person still sees the waiting page after you gave them a role.** Ask them to press **Check again** on that page.
- **The Front Desk or Line Department box is greyed out.** That person is an Administrator, so those roles are already included. Untick Administrator to choose roles one by one.
