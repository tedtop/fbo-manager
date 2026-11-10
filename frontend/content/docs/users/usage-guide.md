---
title: Users and sign-in usage guide
module: users
order: 1
anchors: [sign-in, promote, set-real-email, link-signup, invite]
---

## Overview

Staff sign in with **Continue with Google**. A new person who signs in with Google lands on **Awaiting access** (the `/pending` page) until an administrator gives them a role in **Users**. Line crew were created ahead of time with a placeholder email (`first.last@minutemanfbo.local`) and a shared starting password; their shifts are attached to that account.

- **Users** lists everyone. Sign-ups waiting for a role are at the top.
- The role dropdown on a row is the quick way to give or change access.
- The **⋯** menu on a row has Edit, Set real email, Link to staff account, Deactivate and Delete.

## Common tasks

### How staff sign in {#sign-in}

Press **Continue with Google** on the login page and pick the Google account. If an account already exists with that email, Google signs in to it. If not, a new account is created with no role and the person waits on Awaiting access.

### Give a new sign-up access {#promote}

Open **Users**, find the person under Awaiting access and pick a role in the Role dropdown. They get in the next time they press **Check again** or reload.

### Put a real email on a staff account {#set-real-email}

Use this for line crew who already have a placeholder account, so their shifts and role stay with them.

1. Open **Users**, find the staff account, press **⋯** then **Set real email**.
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

- **"Another account already uses that email."** A second account holds that address. If it is a Google sign-up, use **Link to staff account** on it instead.
- **The person still lands on Awaiting access after Set real email.** They signed in with a different Google address than the one you typed. Check the spelling, or use Link to staff account on the new sign-up.
- **No staff accounts to choose when linking.** Every seeded account already has a real email.

To open the page, go to [Users](module:users).
