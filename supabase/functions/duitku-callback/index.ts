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
    const payload = await req.json()
    const { merchantCode, amount, merchantOrderId, resultCode, signature } = payload

    const apiKey = Deno.env.get('DUITKU_API_KEY')!
    const expectedSignature = CryptoJS.MD5(merchantCode + String(amount) + merchantOrderId + apiKey).toString()
    
    if (signature !== expectedSignature) {
        return new Response(JSON.stringify({ message: 'Invalid Signature' }), { status: 403, headers: corsHeaders })
    }

    if (resultCode === '00') {
      const paymentDb = createClient(Deno.env.get('PAYMENT_DB_URL')!, Deno.env.get('PAYMENT_DB_SERVICE_KEY')!)
      const mainDb = createClient(Deno.env.get('MAIN_DB_URL')!, Deno.env.get('MAIN_DB_SERVICE_KEY')!)

      const { data: trx, error: trxError } = await paymentDb.from('transactions').select('user_id, paket').eq('merchant_order_id', merchantOrderId).single()

      if (trxError || !trx) {
        console.error("❌ Gagal ambil transaksi:", trxError)
        return new Response(JSON.stringify({ message: 'Transaction not found' }), { status: 404, headers: corsHeaders })
      }

      // 1. Update DB Payment
      const { error: payError } = await paymentDb.from('transactions').update({ 
        status: 'paid', 
        paid_at: new Date().toISOString(), 
        callback_data: payload 
      }).eq('merchant_order_id', merchantOrderId)
      
      if (payError) console.error("❌ Gagal update DB Payment:", payError)

      // 🚨 2. UPDATE DB UTAMA (ROLE USER) - PASANG CCTV DI SINI
      const { error: roleError } = await mainDb.from('profiles').update({ role: trx.paket }).eq('id', trx.user_id)
      
      if (roleError) {
        console.error("❌ GAGAL UPDATE ROLE DI DB UTAMA:", roleError.message)
        console.error("Cek MAIN_DB_URL:", Deno.env.get('MAIN_DB_URL'))
      } else {
        console.log(`✅ SUKSES UPDATE ROLE: User ${trx.user_id} -> ${trx.paket}`)
      }
    }
    return new Response(JSON.stringify({ message: 'Success' }), { status: 200, headers: corsHeaders })
  } catch (error) {
    console.error("Callback Crash:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }
})