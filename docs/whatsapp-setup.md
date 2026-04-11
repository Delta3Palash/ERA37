# WhatsApp Cloud API Setup for ERA37

## Prerequisites
- A Meta (Facebook) account
- A Meta Business portfolio in good standing (no advertising restrictions)
- A phone number to receive test messages

---

## Step 1: Create a Meta Developer Account
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Log in with your Facebook account (or create one)
3. Click **Get Started** and complete the developer registration

## Step 2: Create a Meta App
1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click **Create App**
3. Filter by **Business messaging** on the left sidebar
4. Select **Connect with customers through WhatsApp**
5. Click **Next**
6. App name: `ERA37` (or your preferred name)
7. Select your Business portfolio
8. Click **Create App**

> **Note:** If you get "Business is not allowed to claim App", your Meta Business portfolio has a restriction. Go to [business.facebook.com/settings/security](https://business.facebook.com/settings/security) to check for policy violations and request a review. Alternatively, create a new Business portfolio at [business.facebook.com/overview](https://business.facebook.com/overview).

## Step 3: Get Your Credentials
After creating the app, go to **WhatsApp > API Setup** in the left sidebar.

You'll find:

| Credential | Where |
|-----------|-------|
| **Phone Number ID** | Under "From" section — a numeric ID like `123456789012345` |
| **Temporary Access Token** | Click **Generate** (valid 24 hours — see Step 7 for permanent token) |
| **Test Phone Number** | Meta provides a free test sender number |

Save these values — you'll need them for ERA37.

## Step 4: Add a Recipient Phone Number
1. Still on **API Setup**, find the **"To"** section
2. Click **Manage phone number list** or **Add phone number**
3. Enter the phone number you want ERA37 to communicate with
4. Verify it with the SMS/call code Meta sends
5. Copy this number (format: just digits, e.g., `14155551234`)

## Step 5: Set Up the Webhook
1. Go to **WhatsApp > Configuration** in the left sidebar
2. Under **Webhook**, click **Edit**
3. Enter:
   - **Callback URL**: `https://era37.vercel.app/api/webhooks/whatsapp`
   - **Verify Token**: Choose any secret string (e.g., `era37-whatsapp-verify-2024`). You'll use this same string in ERA37.
4. Click **Verify and Save**
5. After verification succeeds, click **Manage** next to Webhook fields
6. **Subscribe** to the `messages` field (the checkbox must be checked)

## Step 6: Connect in ERA37
1. Log in to ERA37 as admin
2. Go to **Settings** (gear icon)
3. Scroll to **WhatsApp** under Connected Channels
4. Enter:
   - **Phone Number ID**: from Step 3
   - **Permanent Access Token**: from Step 3 (or Step 7 for permanent)
   - **Webhook Verify Token**: the exact string you used in Step 5
   - **Recipient Phone**: the verified number from Step 4 (e.g., `14155551234`)
   - **Channel Name**: whatever you want (e.g., `WhatsApp Support`)
5. Click **Connect**

## Step 7: Get a Permanent Access Token
The temporary token from Step 3 expires in 24 hours. For production use:

1. Go to [business.facebook.com](https://business.facebook.com)
2. Click **Settings** (gear icon)
3. Go to **Users > System Users** in the left sidebar (under Business Settings)
4. Click **Add** → name it `ERA37 Bot`, role **Admin** → Create
5. Click on the new system user → **Add Assets**
6. Select **Apps** → select your ERA37 WhatsApp app → toggle **Full Control** → Save
7. Click **Generate New Token**
8. Select your app and check these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
9. Click **Generate Token** → **copy it immediately** (you won't see it again)
10. Update the access token in ERA37: remove the WhatsApp connection in Settings and re-add it with the new permanent token

## Step 8: Add Environment Variable to Vercel (Recommended)
For webhook signature validation (security):

1. In Meta Developer Portal, go to your app's **Settings > Basic**
2. Copy the **App Secret**
3. In Vercel → ERA37 project → **Settings > Environment Variables**
4. Add: `WHATSAPP_APP_SECRET` = your app secret
5. Redeploy the project

## Step 9: Test
1. Send a WhatsApp message from the recipient phone to the test number Meta provided
2. It should appear in ERA37's unified chat view
3. Send a message from ERA37 → it should arrive on WhatsApp
4. If bridging is enabled, WhatsApp messages will also forward to Discord/Slack/Telegram

---

## Important Notes

### Test Mode Limits
- Without Meta Business verification, you can only message numbers you've manually added and verified in Step 4 (up to 5 numbers)
- Messages can only be sent within 24 hours of the user's last message (the "customer service window")

### Business Verification
For production use beyond test numbers:
- Go to [business.facebook.com/settings/security](https://business.facebook.com/settings/security)
- Complete the business verification process (requires official business documents)
- This can take a few days for Meta to review

### Message Templates
- WhatsApp requires pre-approved **message templates** to initiate conversations (sending the first message to a user)
- Replies within 24 hours of the user's last message are free-form (no template needed)
- Templates can be created in **WhatsApp > Message Templates** in the Meta Developer Portal

### Pricing
- WhatsApp Cloud API includes **1,000 free conversations per month**
- Beyond that, Meta charges per conversation (rates vary by country)
- See [Meta's pricing page](https://developers.facebook.com/docs/whatsapp/pricing) for details

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Business is not allowed to claim App" | Your Meta Business portfolio has a restriction. Check [Security Center](https://business.facebook.com/settings/security) or create a new portfolio |
| Webhook verification fails | Ensure the Verify Token in Meta matches exactly what you entered in ERA37 Settings |
| Messages not appearing in ERA37 | Check that you subscribed to the `messages` webhook field in Step 5.6 |
| Can't send from ERA37 | Verify the access token hasn't expired. Use a permanent token (Step 7) |
| "Message failed to send" | Ensure the recipient number is verified (Step 4) and within the 24-hour service window |

---

## Environment Variables Reference

| Variable | Where | Required |
|----------|-------|----------|
| `WHATSAPP_APP_SECRET` | Vercel | Recommended (for webhook signature validation) |

The WhatsApp access token and phone number ID are stored in the ERA37 database (connections table), not as environment variables.
