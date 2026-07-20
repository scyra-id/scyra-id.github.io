import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import CryptoJS from "npm:crypto-js@4.1.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { paket, amount } = await req.json()
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized: No Auth Header')

    const mainDb = createClient(Deno.env.get('MAIN_DB_URL')!, Deno.env.get('MAIN_DB_SERVICE_KEY')!)
    const { data: { user }, error: authError } = await mainDb.auth.getUser(authHeader.split(' ')[1])
    
    if (authError || !user) throw new Error('Unauthorized: Invalid Token')

    const merchantOrderId = `SCYRA-${Date.now()}-${user.id.substring(0, 8)}`
    const merchantCode = Deno.env.get('DUITKU_MERCHANT_CODE')!
    const apiKey = Deno.env.get('DUITKU_API_KEY')!
    
    const signature = CryptoJS.MD5(merchantCode + merchantOrderId + amount + apiKey).toString()

    const payload = {
      merchantCode, 
      paymentAmount: amount, 
      paymentMethod: 'OV', // OVO -> Generate QRIS
      merchantOrderId, 
      productDetails: `Paket ${paket} Scyra`,
      customerVaName: 'Scyra User',
      email: user.email, 
      signature, 
      expiryPeriod: 15
    }

    console.log("🚀 Sending to Duitku:", payload)

    const duitkuRes = await fetch('https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const rawText = await duitkuRes.text()
    console.log("📥 Raw Duitku Response:", rawText)

    let duitkuData
    try {
      duitkuData = JSON.parse(rawText)
    } catch (e) {
      throw new Error(`Duitku return non-JSON: ${rawText.substring(0, 500)}`)
    }

    // 🚨 FIX: Duitku pakai statusCode, bukan responseCode!
    if (duitkuData.statusCode !== '00') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: duitkuData.statusMessage || 'Duitku Error', 
          duitkuFullResponse: duitkuData,
          sentPayload: { ...payload, signature: '***hidden***' }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 🚨 FIX: Duitku return paymentUrl, kita generate QR dari URL tersebut
    const qrString = duitkuData.qrString || duitkuData.paymentUrl

    const paymentDb = createClient(Deno.env.get('PAYMENT_DB_URL')!, Deno.env.get('PAYMENT_DB_SERVICE_KEY')!)
    await paymentDb.from('transactions').insert({
      user_id: user.id, 
      merchant_order_id: merchantOrderId, 
      paket, 
      amount,
      final_amount: amount, 
      status: 'pending', 
      qr_string: qrString,
      payment_url: duitkuData.paymentUrl
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        qrString: qrString, 
        merchantOrderId,
        paymentUrl: duitkuData.paymentUrl 
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("❌ Edge Function Crash:", error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || String(error), 
        stack: error.stack 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})