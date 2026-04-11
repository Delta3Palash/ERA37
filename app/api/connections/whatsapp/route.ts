import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getWhatsAppPhoneInfo } from "@/lib/whatsapp";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { phoneNumberId, accessToken, verifyToken, recipientPhone, channelName } = await req.json();
  if (!phoneNumberId || !accessToken || !verifyToken || !recipientPhone) {
    return NextResponse.json(
      { error: "Phone Number ID, Access Token, Verify Token, and Recipient Phone are required" },
      { status: 400 }
    );
  }

  try {
    // Verify credentials by calling WhatsApp API
    const phoneInfo = await getWhatsAppPhoneInfo(phoneNumberId, accessToken);

    const displayPhone = phoneInfo.display_phone_number || recipientPhone;

    // Save connection
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("connections")
      .upsert(
        {
          platform: "whatsapp",
          platform_channel_id: recipientPhone,
          channel_name: channelName || `WhatsApp ${displayPhone}`,
          bot_token: accessToken,
          metadata: {
            phone_number_id: phoneNumberId,
            verify_token: verifyToken,
            verified_phone_number: phoneInfo.verified_name || null,
          },
          created_by: user.id,
        },
        { onConflict: "platform,platform_channel_id" }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
