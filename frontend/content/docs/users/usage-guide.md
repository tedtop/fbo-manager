---
title: Manage Users usage guide
module: users
order: 1
anchors: [how-access-works, roles, awaiting-access, sign-in, promote, assign-roles, administrator-includes-all-roles, sort-columns, edit-in-table, phone-format, set-real-email, link-signup, invite]
---

## Overview

Manage Users lists everyone who can sign in. Staff sign in with **Continue with Google**. A new person who signs in with Google lands on **Awaiting access** (the `/pending` page) until an administrator gives them a role. Roles decide which modules a person can open: Administrator, Front Desk, Line Department and Customer. Only Administrators can open this page.

Line crew were created ahead of time with a placeholder email (`first.last@minutemanfbo.local`) and a shared starting password; their shifts are attached to that account.

- **Users** lists everyone. Click a column heading to sort.
- The role dropdown on a row is the quick way to give or change access.
- The **⋯** menu on a row has Edit, Set real email, Link to staff account, Deactivate and Delete.

## Common tasks

### How access works {#how-access-works}

Signing in and getting access are two separate steps.

1. A person presses **Continue with Google** on the login page. This creates their account, with no role.
2. Until they have a role, the app holds them on **Awaiting access** (the `/pending` page). Nothing else opens for them.
3. An administrator opens [Users](module:users), finds the new sign-up and gives them a role. Access starts as soon as the role is saved.
4. The person presses **Check again** on the waiting page (or reloads) and lands on their first page.

A role with no modules, or a deactivated account, is also held on the waiting page, with a message that says which.

### The four roles {#roles}

| Role | What it gives |
|---|---|
| Administrator | Everything, including Users. For line managers and management. |
| Front Desk | Manage flight operations, invoicing and parking. View fuel farm, equipment and the line schedule. |
| Line Department | Manage equipment, fuel farm and truck sheets. View the flight board, parking, training and the line schedule. |
| Customer | Can sign in, but sees no modules yet. For aircraft owners. |

The exact levels per module are editable under **Users > Roles & Permissions**. A person can hold more than one role. Change someone's roles from [Users](module:users).

### What "Awaiting access" means {#awaiting-access}

It means the person has an account but no role yet. On the Users page they sit at the top of the list with Awaiting access in the Role column, and the **Awaiting access** card counts them. Click that card to filter the list to them. The page you see when waiting cannot open this guide, so the same explanation is shown on it. Give them a role (see **Give a new sign-up access**) and they are no longer awaiting. If it is someone you do not recognise, leave them waiting or delete the account.

### How staff sign in {#sign-in}

Press **Continue with Google** on the login page and pick the Google account. If an account already exists with that email, Google signs in to it. If not, a new account is created with no role and the person waits on Awaiting access.

### Give a new sign-up access {#promote}

Open **Users**, find the person under Awaiting access and pick a role in the Role dropdown. They get in the next time they press **Check again** or reload.

### Assign roles {#assign-roles}

1. In the Role column, pick a role from the list for one-click changes, or open the row menu and choose **Edit** to tick several roles.
2. In the Edit User sheet, tick the roles the person should have under **Roles** and press **Save Changes**.

The app refuses to remove the last active Administrator, and you cannot remove your own Administrator role or deactivate your own account.

### Administrator includes all roles {#administrator-includes-all-roles}

An Administrator can open and manage every module, so ticking **Administrator** automatically gives them everything Front Desk and Line Department give. In the Edit User sheet those two roles then show as ticked and greyed out with "Included with Administrator", and the Users list shows just "Administrator" for that person.

- Customer is not included. It is for aircraft owners and has no module access, so an administrator who is also an aircraft owner can still tick Customer.
- Unticking Administrator brings back the normal choices. Front Desk and Line Department are not remembered from before, so tick them again if the person should keep them.

### Sort the list {#sort-columns}

Click a column heading (Name, Email, Phone, Role, Joined, Employee ID, Badge ID, Status) to sort by it. Click again to reverse; the arrow shows the direction. The list starts sorted by name, with "No name yet" accounts at the bottom. Empty cells always sort to the bottom. Whether the name sort goes by last name first (Leathers, Keith) or first name first (Keith, Leathers) is a setting: **Settings > Names > Sort users by**. A heading click changes the order for that visit only; reloading the page goes back to the setting.

### Edit a cell in the table {#edit-in-table}

Click a Name, Email, Phone, Joined, Employee ID or Badge ID cell to edit it in place.

- **Enter** or clicking away saves. **Esc** cancels. **Tab** saves and moves to the next editable cell.
- A small "Saving…", "Saved" or red error note shows next to the cell. Errors (a missing name, an ID that is already used, a bad date) stay on the cell until you fix or cancel it.
- Name has two boxes, first and last. Both are required.
- **Email** is the sign-in identity, so changing it asks you to confirm first ("This changes how they sign in"). It works like **Set real email**: their old password stops working and Google becomes the only way in. You cannot change your own email here.
- The Role dropdown and Status work as before.

The Edit User sheet does the same job in a form; both use the same checks.

### Phone numbers {#phone-format}

Phone fields (in the table and in the Edit User sheet) format as you type: **(555) 555-1234**. Only digits are accepted. Paste a number in any format (`555-555-1234`, `+1 555 555 1234`, `5555551234`) and it is tidied up. Clear the field to remove the number. US numbers only; a leading 1 is dropped.

### Put a real email on a staff account {#set-real-email}

Use this for line crew who already have a placeholder account, so their shifts and role stay with them.

1. Open **Users**, find the staff account, press **⋯** then **Set real email** (or click the Email cell and edit it).
2. Type the person's Google address and press **Set email**.
3. Tell them to press **Continue with Google** with that Google account.

The real email replaces the placeholder as their login, in the sign-in account, the user list and the staff record. Their old password stops working (a new random one is set), so Google is the only way in. Their role, shifts and history do not change. You cannot change your own email here.

### Link someone who already signed in with Google {#link-signup}

If the person signed in with Google before you set their real email, they have a second, empty account on Awaiting access. Merge it into their staff account:

1. Find the new sign-up (role Awaiting access, a real email) and press **⋯** then **Link to staff account**.
2. Choose their staff account (the ones still on a `.local` placeholder email) and press **Link account**.
3. Tell them to sign in with Google once more.

The empty sign-up is deleted and its email moves onto the chosen staff account. A sign-up that already has a role is never deleted this way.

### Invite someone by email {#invite}

**Invite User** sends an email invitation and creates the account with the role you pick. Use it for someone who is not on the staff list yet.

## Troubleshooting

- **"At least one active Administrator is required."** Make someone else an Administrator first, then change this person.
- **A person still sees the waiting page after you gave them a role.** Ask them to press **Check again** on that page.
- **The Front Desk or Line Department box is greyed out.** That person is an Administrator, so those roles are already included. Untick Administrator to choose roles one by one.
- **"Another account already uses that email."** A second account holds that address. If it is a Google sign-up, use **Link to staff account** on it instead.
- **The person still lands on Awaiting access after Set real email.** They signed in with a different Google address than the one you typed. Check the spelling, or use Link to staff account on the new sign-up.
- **No staff accounts to choose when linking.** Every seeded account already has a real email.

To open the page, go to [Users](module:users).
