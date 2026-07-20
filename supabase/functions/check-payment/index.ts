import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  
  try {
    const { merchantOrderId } = await req.json()
    
    if (!merchantOrderId) {
      throw new Error('merchantOrderId is required')
    }

    const paymentDb = createClient(
      Deno.env.get('PAYMENT_DB_URL')!, 
      Deno.env.get('PAYMENT_DB_SERVICE_KEY')!
    )
    
    const { data, error } = await paymentDb
      .from('transactions')
      .select('status, paket')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle() // 🚨 Pakai maybeSingle biar gak throw error kalau data belum ada

    if (error) throw error

    // Kalau data belum ada (transaksi baru aja dibuat dan belum masuk DB), return pending
    if (!data) {
      return new Response(
        JSON.stringify({ success: true, status: 'pending', paket: null }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // 🚨 SELALU RETURN STATUS 200 biar frontend gak nge-throw FunctionsHttpError
    return new Response(
      JSON.stringify({ success: true, status: data.status, paket: data.paket }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error("Check Payment Error:", error)
    // Return 200 dengan success: false biar frontend bisa baca JSON-nya
    return new Response(
      JSON.stringify({ success: false, error: error.message || String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})