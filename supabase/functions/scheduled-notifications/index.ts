import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const nextjsUrl = "https://kpaksbuddy.com";
const cronSecret = Deno.env.get("CRON_SECRET") || "cVfF0oBcDgyFbPhJdxr_azYpPVZIsnOrRBVNC2bwFdw";

const supabase = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    console.log("[scheduled-notifications] Starting check...");

    const results = {
      stops_pending: 0,
      sales_pending: 0,
      credits_exceeded: 0,
      low_fuel: 0,
      driver_reminders: 0,
      errors: [] as string[],
    };

    // 1. Stops pending 6+ hours
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: pendingStops } = await supabase
        .from("Stops")
        .select("stop_id, broker_id, trip_id, stop_time")
        .eq("confirmed", false)
        .eq("disputed", false)
        .lt("stop_time", sixHoursAgo)
        .limit(50);

      if (pendingStops && pendingStops.length > 0) {
        for (const stop of pendingStops) {
          const { data: trip } = await supabase
            .from("Trips")
            .select("plate_number")
            .eq("trip_id", stop.trip_id)
            .single();

          if (trip && stop.broker_id) {
            await callNotificationApi("stop-reminder", {
              brokerId: stop.broker_id,
              plateNumber: trip.plate_number,
            });
            results.stops_pending++;
          }
        }
      }
    } catch (e) {
      results.errors.push(`stops: ${(e as Error).message}`);
    }

    // 2. Store sales pending 6+ hours
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: pendingSales } = await supabase
        .from("store_sales")
        .select("sale_id, broker_id, broker_name, store_name, sold_at, status")
        .eq("status", "Pending")
        .lt("sold_at", sixHoursAgo)
        .limit(50);

      if (pendingSales && pendingSales.length > 0) {
        for (const sale of pendingSales) {
          const hours = Math.round(
            (Date.now() - new Date(sale.sold_at).getTime()) / (1000 * 60 * 60)
          );

          if (sale.broker_id) {
            await callNotificationApi("store-sale-reminder", {
              brokerId: sale.broker_id,
              storeName: sale.store_name,
            });
          }
          await callNotificationApi("admin-pending-sale", {
            brokerName: sale.broker_name || "Unknown",
            storeName: sale.store_name,
            hours,
          });
          results.sales_pending++;
        }
      }
    } catch (e) {
      results.errors.push(`sales: ${(e as Error).message}`);
    }

    // 3. Credits exceeded 15 days
    try {
      const { data: exceededCredits } = await supabase
        .from("broker_credits")
        .select("credit_id, broker_id, customer_name, age_of_credit, status")
        .eq("status", "Active")
        .gte("age_of_credit", 15)
        .limit(50);

      if (exceededCredits && exceededCredits.length > 0) {
        for (const credit of exceededCredits) {
          if (credit.broker_id) {
            await callNotificationApi("credit-exceeded-broker", {
              brokerId: credit.broker_id,
              customerName: credit.customer_name,
            });
          }
          await callNotificationApi("credit-exceeded-admin", {
            customerName: credit.customer_name,
          });
          results.credits_exceeded++;
        }
      }
    } catch (e) {
      results.errors.push(`credits: ${(e as Error).message}`);
    }

    // 4. Low fuel balance
    try {
      const { data: lowFuelCompanies } = await supabase
        .from("fuel_companies")
        .select("company_id, company_name, current_balance, low_balance_threshold")
        .filter("current_balance", "lt", "low_balance_threshold")
        .limit(20);

      if (lowFuelCompanies && lowFuelCompanies.length > 0) {
        for (const company of lowFuelCompanies) {
          await callNotificationApi("low-fuel-admin", {
            stationName: company.company_name,
            balance: company.current_balance,
          });
          await callNotificationApi("low-fuel-station", {
            balance: company.current_balance,
          });
          results.low_fuel++;
        }
      }
    } catch (e) {
      results.errors.push(`fuel: ${(e as Error).message}`);
    }

    // 5. Driver stop reminder (daily) — all drivers with active trips
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: activeTrips } = await supabase
        .from("Trips")
        .select("trip_id, driver_id")
        .eq("status", "In Transit")
        .not("driver_id", "is", null)
        .limit(50);

      if (activeTrips && activeTrips.length > 0) {
        for (const trip of activeTrips) {
          const { data: recentStops } = await supabase
            .from("Stops")
            .select("stop_id")
            .eq("trip_id", trip.trip_id)
            .gte("stop_time", oneDayAgo)
            .limit(1);

          if (!recentStops || recentStops.length === 0) {
            await callNotificationApi("driver-stop-reminder", {});
            results.driver_reminders++;
          }
        }
      }
    } catch (e) {
      results.errors.push(`driver-reminder: ${(e as Error).message}`);
    }

    console.log("[scheduled-notifications] Results:", JSON.stringify(results));

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[scheduled-notifications] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function callNotificationApi(type: string, data: Record<string, unknown>) {
  try {
    const res = await fetch(`${nextjsUrl}/api/cron/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ type, ...data }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[scheduled-notifications] API error for ${type}:`, text);
    }
  } catch (e) {
    console.error(`[scheduled-notifications] Failed to call API for ${type}:`, (e as Error).message);
  }
}
