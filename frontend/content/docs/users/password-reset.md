---
title: Forgot or reset your password
module: users
order: 2
anchors: [reset-password, link-expired, no-email]
---

## Overview

Staff sign in with **Continue with Google**. Anyone who would rather use email and a password sets or resets that password themselves, by email. Nobody needs an administrator to do it.

## Common tasks

### Reset your password {#reset-password}

1. On the login page press **Forgot password?**.
2. Type the email on your account (the real one, not the old `@minutemanfbo.local` placeholder) and press **Send reset link**.
3. Open the email titled **Reset your password** and press the link. It opens a page called **Choose a new password**.
4. Type the new password twice (at least 8 characters) and press **Save password**. You are signed in.

The page always says "If an account exists for that email, a reset link is on its way", whether or not the email has an account.

### The link says it expired {#link-expired}

Each link works once and lasts an hour. Opening it a second time, or in another browser than the one you asked from, fails and sends you back to **Reset password** to ask again. Request the link and open it in the same browser.

### No email arrived {#no-email}

Check spam first. Then confirm the address is the one on your account (an administrator can see it in **Users**). The system limits how many reset emails it sends per hour, so wait a few minutes before asking again.
