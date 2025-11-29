/// INSERT YOUR WEBHOOK CLIENT SETUP CODE HERE ///
/// PROBABLY WILL BE SOMETHING LIKE THIS ///
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1. Optimized Supabase Client Initialization
// Using Service Role Key for write permissions
// This runs only on the server, so it's safe.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request) {
  try {
    // 2. Security: Verify secret token
    // Kiwify URL must be something like: https://your-vercel-app.vercel.app/api/webhooks/kiwify?secret=YOUR-PASSWORD
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== process.env.KIWIFY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Read Data
    const data = await request.json();
    const { order_status, Customer } = data;
    const email = Customer?.email;

    // Log for debugging
    console.log(`Webhook Kiwify: Status=${order_status}, Email=${email}`);

    if (!email) {
      return NextResponse.json({ error: 'Email não encontrado' }, { status: 400 });
    }

    // 4. Approval Logic
    if (order_status === 'paid' || order_status === 'approved') {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .upsert({ 
          email: email, 
          status: 'active', // Important for access control
          updated_at: new Date()
        }, { onConflict: 'email' });

      if (error) {
        console.error('Error Supabase (Insert):', error);
        return NextResponse.json({ error: 'Error while saving on Database' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Gave Access' });
    }

    // 5. Reivoke Logic
    // If client chargeback, reivoke access imediately
    if (order_status === 'refunded' || order_status === 'chargedback') {
      // Option A: Delete registry (Simpler)
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .delete()
        .eq('email', email);

      // Option B (Alternative): Only change status for 'inactive' (Better for history)
      /*
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'inactive', updated_at: new Date() })
        .eq('email', email);
      */

      if (error) {
        console.error('Erro Supabase (Revoke):', error);
        return NextResponse.json({ error: 'Error while access reivoking' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Reivoked Access' });
    }

    // Ignoered Status (waiting_payment, etc)
    return NextResponse.json({ message: 'Ignored Status' });

  } catch (error) {
    console.error('Erro fatal no webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}